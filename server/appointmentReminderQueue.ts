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
