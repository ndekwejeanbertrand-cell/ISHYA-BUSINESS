import crypto from 'node:crypto';
import { getGoogleServiceAccountAccessToken } from './googleServiceAccount.ts';
import { buildAppointmentReminderJobs, type AppointmentNotificationChannel } from './appointments.ts';
import { getFirebaseConfig } from './auth.ts';

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = { name?: string; updateTime?: string; fields?: Record<string, FirestoreValue> };

const REMINDER_COLLECTION = 'appointmentReminderJobs';

function firestoreRoot(): string {
  const config = getFirebaseConfig();
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/${encodeURIComponent(config.firestoreDatabaseId)}/documents`;
}

function encode(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encode(item)])) } };
  throw new Error('Unsupported Firestore reminder value.');
}

function decode(value?: FirestoreValue): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (((value.arrayValue as { values?: FirestoreValue[] }).values) ?? []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries((value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}

function unpack(document: FirestoreDocument): Record<string, unknown> {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]));
}

async function firestoreRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGoogleServiceAccountAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${firestoreRoot()}${path}`, { ...init, headers });
}

export interface ConfirmedAppointmentForReminders {
  id: string;
  businessId: string;
  customerUid: string;
  customerPhone: string;
  customerName: string;
  customerEmail?: string;
  startAt: string;
  status: 'confirmed' | 'pending' | 'declined' | 'cancelled' | 'completed' | 'no_show';
  notificationChannels: readonly AppointmentNotificationChannel[];
  language: 'rw' | 'en' | 'fr';
  timeZone: string;
}

export function buildReminderQueueRecords(appointment: ConfirmedAppointmentForReminders, now = Date.now()) {
  return buildAppointmentReminderJobs(appointment, now).flatMap((job) =>
    job.channels.map((channel) => ({
      // Include the appointment start time so a reschedule creates a fresh reminder set.
      id: [job.appointmentId, Date.parse(appointment.startAt), job.offset, channel].join('_'),
      appointmentId: job.appointmentId,
      businessId: job.businessId,
      appointmentStartAt: appointment.startAt,
      serviceName: (appointment as ConfirmedAppointmentForReminders & { serviceName?: string }).serviceName ?? '',
      businessName: (appointment as ConfirmedAppointmentForReminders & { businessName?: string }).businessName ?? '',
      customerUid: job.customerUid,
      customerPhone: appointment.customerPhone,
      customerName: appointment.customerName,
      ...(appointment.customerEmail ? { customerEmail: appointment.customerEmail } : {}),
      language: appointment.language,
      timeZone: appointment.timeZone,
      offset: job.offset,
      channel,
      scheduledAt: job.scheduledAt,
      status: 'pending' as const,
      attemptCount: 0,
      nextAttemptAt: job.scheduledAt,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    }))
  );
}

/**
 * Creates deterministic per-channel reminder documents. Existing documents are
 * left untouched, so retries cannot reset sent/processing jobs to pending.
 */
export async function enqueueAppointmentReminders(
  appointment: ConfirmedAppointmentForReminders,
  now = Date.now()
): Promise<{ created: number; existing: number }> {
  const records = buildReminderQueueRecords(appointment, now);
  if (!records.length) return { created: 0, existing: 0 };

  const query = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: REMINDER_COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: 'appointmentId' }, op: 'EQUAL', value: { stringValue: appointment.id } } },
        limit: 100,
      },
    }),
  });
  if (!query.ok) throw new Error(`Reminder queue lookup failed (HTTP ${query.status}).`);
  const rows = await query.json() as Array<{ document?: FirestoreDocument }>;
  const existingIds = new Set(rows.filter((row) => row.document).map((row) => row.document!.name?.split('/').pop()).filter(Boolean));
  const missing = records.filter((record) => !existingIds.has(record.id));
  if (!missing.length) return { created: 0, existing: records.length };

  const response = await firestoreRequest(':commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: missing.map((record) => ({
        update: {
          name: `${firestoreRoot()}/${REMINDER_COLLECTION}/${encodeURIComponent(record.id)}`,
          fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)])),
        },
        currentDocument: { exists: false },
      })),
    }),
  });
  if (!response.ok) throw new Error(`Reminder queue write failed (HTTP ${response.status}).`);
  return { created: missing.length, existing: records.length - missing.length };
}


export interface ClaimedReminderJob {
  id: string;
  leaseToken: string;
  leaseUntil: string;
  attemptCount: number;
  record: Record<string, unknown>;
}

/** Atomically claims due jobs using Firestore updateTime preconditions. */
export async function claimDueAppointmentReminderJobs(
  now = Date.now(),
  options: { limit?: number; leaseMs?: number; channel?: string } = {}
): Promise<ClaimedReminderJob[]> {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)));
  const leaseMs = Math.min(15 * 60_000, Math.max(30_000, options.leaseMs ?? 5 * 60_000));
  const query = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: REMINDER_COLLECTION }],
        where: options.channel
          ? { compositeFilter: { op: 'AND', filters: [
              { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
              { fieldFilter: { field: { fieldPath: 'channel' }, op: 'EQUAL', value: { stringValue: options.channel } } },
            ] } }
          : { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
        limit: 250,
      },
    }),
  });
  if (!query.ok) throw new Error(`Reminder worker lookup failed (HTTP ${query.status}).`);
  const rows = await query.json() as Array<{ document?: FirestoreDocument }>;
  const due = rows.map((row) => row.document).filter((doc): doc is FirestoreDocument => Boolean(doc?.name && doc.updateTime))
    .map((doc) => ({ doc, record: unpack(doc) }))
    .filter(({ record }) => typeof record.nextAttemptAt === 'string' && Date.parse(String(record.nextAttemptAt)) <= now)
    .sort((a, b) => Date.parse(String(a.record.nextAttemptAt)) - Date.parse(String(b.record.nextAttemptAt)))
    .slice(0, limit);

  const claimed: ClaimedReminderJob[] = [];
  for (const item of due) {
    const id = item.doc.name!.split('/').pop()!;
    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(now + leaseMs).toISOString();
    const attemptCount = Number(item.record.attemptCount ?? 0) + 1;
    const response = await firestoreRequest(':commit', {
      method: 'POST',
      body: JSON.stringify({
        writes: [{
          update: {
            name: item.doc.name,
            fields: {
              status: encode('processing'),
              leaseToken: encode(leaseToken),
              leaseUntil: encode(leaseUntil),
              attemptCount: encode(attemptCount),
              updatedAt: encode(new Date(now).toISOString()),
            },
          },
          updateMask: { fieldPaths: ['status', 'leaseToken', 'leaseUntil', 'attemptCount', 'updatedAt'] },
          currentDocument: { updateTime: item.doc.updateTime },
        }],
      }),
    });
    // A failed precondition means another worker won the claim; skip it.
    if (response.status === 409 || response.status === 412) continue;
    if (!response.ok) throw new Error(`Reminder job claim failed (HTTP ${response.status}).`);
    claimed.push({ id, leaseToken, leaseUntil, attemptCount, record: item.record });
  }
  return claimed;
}


/** Exponential retry delay with a cap; attempt 1 waits 1 minute. */
export function getReminderRetryDelayMs(attemptCount: number): number {
  const attempt = Math.max(1, Math.min(10, Math.floor(Number.isFinite(attemptCount) ? attemptCount : 1)));
  return Math.min(60 * 60_000, 60_000 * (2 ** (attempt - 1)));
}

/**
 * Returns abandoned processing jobs to pending after their lease expires.
 * Firestore updateTime preconditions prevent overwriting a concurrently renewed lease.
 */
export async function recoverExpiredAppointmentReminderClaims(
  now = Date.now(),
  limit = 50
): Promise<number> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const query = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: REMINDER_COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'processing' } } },
        limit: 250,
      },
    }),
  });
  if (!query.ok) throw new Error(`Expired reminder lease lookup failed (HTTP ${query.status}).`);
  const rows = await query.json() as Array<{ document?: FirestoreDocument }>;
  const expired = rows.map((row) => row.document).filter((doc): doc is FirestoreDocument => Boolean(doc?.name && doc.updateTime))
    .map((doc) => ({ doc, record: unpack(doc) }))
    .filter(({ record }) => typeof record.leaseUntil === 'string' && Date.parse(String(record.leaseUntil)) <= now)
    .slice(0, safeLimit);
  let recovered = 0;
  for (const { doc, record } of expired) {
    const response = await firestoreRequest(':commit', {
      method: 'POST',
      body: JSON.stringify({
        writes: [{
          update: {
            name: doc.name,
            fields: {
              status: encode('pending'),
              nextAttemptAt: encode(new Date(now).toISOString()),
              leaseToken: encode(null),
              leaseUntil: encode(null),
              lastError: encode('Previous worker lease expired before delivery completed.'),
              updatedAt: encode(new Date(now).toISOString()),
            },
          },
          updateMask: { fieldPaths: ['status', 'nextAttemptAt', 'leaseToken', 'leaseUntil', 'lastError', 'updatedAt'] },
          currentDocument: { updateTime: doc.updateTime },
        }],
      }),
    });
    if (response.status === 409 || response.status === 412) continue;
    if (!response.ok) throw new Error(`Expired reminder lease recovery failed (HTTP ${response.status}).`);
    recovered += 1;
  }
  return recovered;
}

/** Releases a claimed job only when the caller still owns its lease token. */
export async function releaseAppointmentReminderClaim(
  id: string,
  leaseToken: string,
  nextAttemptAt: string,
  errorMessage: string
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(id) || !leaseToken) throw new Error('Invalid reminder claim.');
  const get = await firestoreRequest(`/${REMINDER_COLLECTION}/${encodeURIComponent(id)}`);
  if (get.status === 404) return false;
  if (!get.ok) throw new Error(`Reminder claim read failed (HTTP ${get.status}).`);
  const doc = await get.json() as FirestoreDocument;
  const record = unpack(doc);
  if (record.status !== 'processing' || record.leaseToken !== leaseToken || !doc.updateTime) return false;
  const response = await firestoreRequest(':commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: {
          name: doc.name,
          fields: {
            status: encode('pending'),
            nextAttemptAt: encode(nextAttemptAt),
            lastError: encode(errorMessage.slice(0, 500)),
            leaseToken: encode(null),
            leaseUntil: encode(null),
            updatedAt: encode(new Date().toISOString()),
          },
        },
        updateMask: { fieldPaths: ['status', 'nextAttemptAt', 'lastError', 'leaseToken', 'leaseUntil', 'updatedAt'] },
        currentDocument: { updateTime: doc.updateTime },
      }],
    }),
  });
  if (response.status === 409 || response.status === 412) return false;
  if (!response.ok) throw new Error(`Reminder claim release failed (HTTP ${response.status}).`);
  return true;
}

/** Cancels only jobs that have not started delivery. */
export async function cancelPendingAppointmentReminders(appointmentId: string, now = Date.now()): Promise<number> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(appointmentId)) throw new Error('Invalid appointment ID.');
  const query = await firestoreRequest(':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: REMINDER_COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: 'appointmentId' }, op: 'EQUAL', value: { stringValue: appointmentId } } },
        limit: 100,
      },
    }),
  });
  if (!query.ok) throw new Error(`Reminder cancellation lookup failed (HTTP ${query.status}).`);
  const rows = await query.json() as Array<{ document?: FirestoreDocument }>;
  const pending = rows.map((row) => row.document).filter((doc): doc is FirestoreDocument => Boolean(doc))
    .filter((doc) => unpack(doc).status === 'pending' && typeof doc.name === 'string');
  if (!pending.length) return 0;

  const writes = pending.map((doc) => ({
    update: {
      name: doc.name,
      fields: { status: encode('cancelled'), updatedAt: encode(new Date(now).toISOString()) },
    },
    updateMask: { fieldPaths: ['status', 'updatedAt'] },
    ...(doc.updateTime ? { currentDocument: { updateTime: doc.updateTime } } : {}),
  }));
  const response = await firestoreRequest(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
  if (!response.ok) throw new Error(`Reminder cancellation failed (HTTP ${response.status}).`);
  return pending.length;
}


export interface CurrentReminderAppointment {
  id: string;
  status: string;
  startAt: string;
  customerName?: string;
  customerPhone?: string;
  serviceName?: string;
  businessName?: string;
  timeZone?: string;
  language?: 'rw' | 'en' | 'fr';
}

/** Re-read authoritative appointment data immediately before attempting delivery. */
export async function getCurrentReminderAppointment(appointmentId: string): Promise<CurrentReminderAppointment | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(appointmentId)) throw new Error('Invalid appointment ID.');
  const response = await firestoreRequest(`/appointments/${encodeURIComponent(appointmentId)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Appointment reminder revalidation failed (HTTP ${response.status}).`);
  const document = await response.json() as FirestoreDocument;
  const record = unpack(document);
  if (typeof record.id !== 'string' || typeof record.status !== 'string' || typeof record.startAt !== 'string') return null;
  return {
    id: record.id,
    status: record.status,
    startAt: record.startAt,
    ...(typeof record.customerName === 'string' ? { customerName: record.customerName } : {}),
    ...(typeof record.customerPhone === 'string' ? { customerPhone: record.customerPhone } : {}),
    ...(typeof record.serviceName === 'string' ? { serviceName: record.serviceName } : {}),
    ...(typeof record.businessName === 'string' ? { businessName: record.businessName } : {}),
    ...(typeof record.timeZone === 'string' ? { timeZone: record.timeZone } : {}),
    ...(record.language === 'rw' || record.language === 'en' || record.language === 'fr' ? { language: record.language } : {}),
  };
}

/** Finalizes a claimed job only while the worker still owns its lease. */
export async function finalizeAppointmentReminderClaim(
  id: string,
  leaseToken: string,
  status: 'sent' | 'cancelled' | 'failed',
  details: { messageId?: string; errorMessage?: string } = {}
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(id) || !leaseToken) throw new Error('Invalid reminder claim.');
  const get = await firestoreRequest(`/${REMINDER_COLLECTION}/${encodeURIComponent(id)}`);
  if (get.status === 404) return false;
  if (!get.ok) throw new Error(`Reminder claim read failed (HTTP ${get.status}).`);
  const doc = await get.json() as FirestoreDocument;
  const record = unpack(doc);
  if (record.status !== 'processing' || record.leaseToken !== leaseToken || !doc.updateTime) return false;
  const fields: Record<string, FirestoreValue> = {
    status: encode(status),
    leaseToken: encode(null),
    leaseUntil: encode(null),
    updatedAt: encode(new Date().toISOString()),
  };
  if (details.messageId) fields.providerMessageId = encode(details.messageId.slice(0, 256));
  if (details.errorMessage) fields.lastError = encode(details.errorMessage.slice(0, 500));
  const response = await firestoreRequest(':commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: { name: doc.name, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
        currentDocument: { updateTime: doc.updateTime },
      }],
    }),
  });
  if (response.status === 409 || response.status === 412) return false;
  if (!response.ok) throw new Error(`Reminder job finalization failed (HTTP ${response.status}).`);
  return true;
}


export interface InAppAppointmentNotificationInput {
  userUid: string;
  appointmentId: string;
  businessId: string;
  language: 'rw' | 'en' | 'fr';
  serviceName: string;
  businessName: string;
  startAt: string;
  timeZone: string;
  offset: string;
}

/** Creates one deterministic, private in-app notification; safe to retry. */
export async function createInAppAppointmentNotification(
  notificationId: string,
  input: InAppAppointmentNotificationInput
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(notificationId)
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.userUid)
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.appointmentId)) {
    throw new Error('Invalid in-app notification identity.');
  }
  const copy = {
    rw: { title: 'Ikwibutsa rendez-vous', body: `Ufite rendez-vous ya ${input.serviceName} kuri ${input.businessName}.` },
    en: { title: 'Appointment reminder', body: `Your ${input.serviceName} appointment at ${input.businessName} is coming up.` },
    fr: { title: 'Rappel de rendez-vous', body: `Votre rendez-vous ${input.serviceName} chez ${input.businessName} approche.` },
  }[input.language];
  const fields = {
    id: notificationId,
    userUid: input.userUid,
    appointmentId: input.appointmentId,
    businessId: input.businessId,
    type: 'appointment_reminder',
    title: copy.title,
    body: copy.body,
    startAt: input.startAt,
    timeZone: input.timeZone,
    offset: input.offset,
    read: false,
    createdAt: new Date().toISOString(),
  };
  const response = await firestoreRequest(':commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: {
          name: `${firestoreRoot()}/userNotifications/${encodeURIComponent(notificationId)}`,
          fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encode(value)])),
        },
        currentDocument: { exists: false },
      }],
    }),
  });
  if (response.ok) return true;
  if (response.status === 409 || response.status === 412) {
    const existing = await firestoreRequest(`/userNotifications/${encodeURIComponent(notificationId)}`);
    if (!existing.ok) throw new Error(`Existing in-app notification verification failed (HTTP ${existing.status}).`);
    const record = unpack(await existing.json() as FirestoreDocument);
    if (record.userUid === input.userUid && record.appointmentId === input.appointmentId) return true;
    throw new Error('In-app notification identity conflict.');
  }
  throw new Error(`In-app notification creation failed (HTTP ${response.status}).`);
}
