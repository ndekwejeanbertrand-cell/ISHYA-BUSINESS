import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { extractBearerToken, verifyFirebaseIdToken } from './auth.ts';
import { getFirestoreBusinessById } from './firestoreRest.ts';
import {
  AppointmentValidationError,
  buildAppointmentReminderJobs,
  parseServiceDurationMinutes,
  validateAppointmentRequest,
} from './appointments.ts';

const FIRESTORE_ROOT = (() => {
  const configPath = process.env.FIREBASE_PROJECT_ID;
  return configPath;
})();

type FirestoreValue = Record<string, unknown>;
type FirestoreDoc = { name?: string; fields?: Record<string, FirestoreValue> };

function firestoreUrl(path = ''): string {
  const projectId = FIRESTORE_ROOT;
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured.');
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents${path}`;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) fields[key] = encodeValue(item);
    return { mapValue: { fields } };
  }
  throw new Error('Unsupported Firestore value.');
}

function decodeValue(value?: FirestoreValue): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return ((value.arrayValue as { values?: FirestoreValue[] }).values ?? []).map(decodeValue);
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
  }
  return undefined;
}

function decodeDocument(doc: FirestoreDoc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decodeValue(v)]));
}

async function firestoreRequest(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(firestoreUrl(path), { ...init, headers });
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof AppointmentValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error('Appointment API error:', error);
  res.status(502).json({ error: 'The appointment service is temporarily unavailable.' });
}

async function authenticate(req: Request) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const user = await verifyFirebaseIdToken(token);
  if (!user.emailVerified) throw Object.assign(new Error('A verified email account is required.'), { status: 403 });
  return { token, user };
}

export function registerAppointmentRoutes(app: Express): void {
  app.post('/api/appointments', async (req, res) => {
    try {
      const { token, user } = await authenticate(req);
      const body = req.body ?? {};
      const businessId = typeof body.businessId === 'string' ? body.businessId : '';
      const business = await getFirestoreBusinessById(businessId, token);
      if (!business || !business.ownerId) {
        res.status(404).json({ error: 'Business not found.' });
        return;
      }

      const requestedBy = body.requestedBy === 'owner' && user.uid === business.ownerId ? 'owner' : 'customer';
      if (body.requestedBy === 'owner' && requestedBy !== 'owner') {
        res.status(403).json({ error: 'Only this business owner can create an approved appointment.' });
        return;
      }

      const request = validateAppointmentRequest({
        ...body,
        customerUid: user.uid,
        requestedBy,
      });
      const service = business.services.find((item) => item.id === request.serviceId);
      if (!service) {
        res.status(400).json({ error: 'The selected service is not available.' });
        return;
      }
      const duration = parseServiceDurationMinutes(service.durationOrUnit);
      if (!duration || Date.parse(request.endAt) - Date.parse(request.startAt) !== duration * 60_000) {
        res.status(400).json({ error: 'This service needs a clear duration, and the appointment time must match it.' });
        return;
      }

      const id = `apt_${crypto.randomUUID().replace(/-/g, '')}`;
      const status = requestedBy === 'owner' ? 'confirmed' : 'pending';
      const appointment = {
        id,
        businessId,
        ownerId: business.ownerId,
        customerUid: user.uid,
        customerName: request.customerName,
        customerPhone: request.customerPhone,
        ...(request.customerEmail ? { customerEmail: request.customerEmail } : {}),
        serviceId: request.serviceId,
        serviceName: service.name,
        startAt: request.startAt,
        endAt: request.endAt,
        timeZone: request.timeZone,
        language: request.language,
        requestedBy,
        status,
        notificationChannels: request.notificationChannels,
        ...(request.customerNote ? { customerNote: request.customerNote } : {}),
      };

      const begin = await firestoreRequest(':beginTransaction', token, {
        method: 'POST',
        body: JSON.stringify({ options: { readWrite: {} } }),
      });
      if (!begin.ok) throw new Error(`Could not begin appointment transaction (${begin.status}).`);
      const { transaction } = await begin.json() as { transaction: string };

      const query = await firestoreRequest(':runQuery', token, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'appointments' }],
            where: { fieldFilter: { field: { fieldPath: 'businessId' }, op: 'EQUAL', value: { stringValue: businessId } } },
            limit: 1000,
          },
          transaction,
        }),
      });
      if (!query.ok) throw new Error(`Could not check existing appointments (${query.status}).`);
      const rows = await query.json() as Array<{ document?: FirestoreDoc }>;
      const conflict = rows.some((row) => {
        if (!row.document) return false;
        const existing = decodeDocument(row.document);
        if (!['pending', 'confirmed'].includes(String(existing.status))) return false;
        return Date.parse(String(existing.startAt)) < Date.parse(request.endAt)
          && Date.parse(String(existing.endAt)) > Date.parse(request.startAt);
      });
      if (conflict) {
        await firestoreRequest(':rollback', token, { method: 'POST', body: JSON.stringify({ transaction }) });
        res.status(409).json({ error: 'This time is no longer available. Please choose another time.' });
        return;
      }

      const nowTransform = (fieldPath: string) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' });
      const commit = await firestoreRequest(':commit', token, {
        method: 'POST',
        body: JSON.stringify({
          transaction,
          writes: [{
            update: {
              name: `${firestoreUrl()}/appointments/${id}`,
              fields: Object.fromEntries(Object.entries(appointment).map(([k, v]) => [k, encodeValue(v)])),
            },
            updateTransforms: [nowTransform('createdAt'), nowTransform('updatedAt')],
            currentDocument: { exists: false },
          }],
        }),
      });
      if (!commit.ok) throw new Error(`Could not save appointment (${commit.status}).`);
      res.status(201).json({ appointment: { ...appointment, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status) {
        res.status(status).json({ error: (error as Error).message });
        return;
      }
      sendError(res, error);
    }
  });

  app.get('/api/appointments', async (req, res) => {
    try {
      const { token, user } = await authenticate(req);
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : '';
      const customerOnly = req.query.scope === 'customer';
      let field = 'customerUid';
      let value = user.uid;
      if (businessId && !customerOnly) {
        const business = await getFirestoreBusinessById(businessId, token);
        if (!business || business.ownerId !== user.uid) {
          res.status(403).json({ error: 'You do not own this business.' });
          return;
        }
        field = 'businessId';
        value = businessId;
      }
      const response = await firestoreRequest(':runQuery', token, {
        method: 'POST',
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'appointments' }],
            where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
            orderBy: [{ field: { fieldPath: 'startAt' }, direction: 'ASCENDING' }],
            limit: 250,
          },
        }),
      });
      if (!response.ok) throw new Error(`Appointment listing failed (${response.status}).`);
      const rows = await response.json() as Array<{ document?: FirestoreDoc }>;
      res.json({ appointments: rows.filter((row) => row.document).map((row) => decodeDocument(row.document!)) });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status) res.status(status).json({ error: (error as Error).message });
      else sendError(res, error);
    }
  });

  app.patch('/api/appointments/:appointmentId', async (req, res) => {
    try {
      const { token, user } = await authenticate(req);
      const id = req.params.appointmentId;
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        res.status(400).json({ error: 'Invalid appointment identifier.' });
        return;
      }
      const getResponse = await firestoreRequest(`/appointments/${encodeURIComponent(id)}`, token);
      if (getResponse.status === 404) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      if (!getResponse.ok) throw new Error(`Appointment lookup failed (${getResponse.status}).`);
      const doc = await getResponse.json() as FirestoreDoc;
      const current = decodeDocument(doc);
      const business = await getFirestoreBusinessById(String(current.businessId), token);
      if (!business || business.ownerId !== user.uid || current.ownerId !== user.uid) {
        res.status(403).json({ error: 'Only the business owner can manage this appointment.' });
        return;
      }

      const body = req.body ?? {};
      const allowedStatuses = ['confirmed', 'declined', 'cancelled', 'completed', 'no_show'];
      const nextStatus = body.status;
      if (nextStatus !== undefined && !allowedStatuses.includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid appointment status.' });
        return;
      }
      const transitions: Record<string, string[]> = {
        pending: ['confirmed', 'declined', 'cancelled'],
        confirmed: ['cancelled', 'completed', 'no_show'],
      };
      if (nextStatus && !(transitions[String(current.status)] ?? []).includes(nextStatus)) {
        res.status(409).json({ error: 'This appointment status transition is not allowed.' });
        return;
      }

      const patch: Record<string, unknown> = {};
      if (nextStatus) patch.status = nextStatus;
      if (body.startAt !== undefined || body.endAt !== undefined) {
        if (current.status !== 'confirmed') {
          res.status(409).json({ error: 'Only confirmed appointments can be rescheduled.' });
          return;
        }
        const startAt = typeof body.startAt === 'string' ? Date.parse(body.startAt) : Date.parse(String(current.startAt));
        const endAt = typeof body.endAt === 'string' ? Date.parse(body.endAt) : Date.parse(String(current.endAt));
        if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= Date.now() || endAt <= startAt || endAt - startAt > 24 * 60 * 60_000) {
          res.status(400).json({ error: 'Invalid rescheduled appointment time.' });
          return;
        }
        patch.startAt = new Date(startAt).toISOString();
        patch.endAt = new Date(endAt).toISOString();
        if (typeof body.timeZone === 'string') patch.timeZone = body.timeZone;
      }
      if (Object.keys(patch).length === 0) {
        res.status(400).json({ error: 'No valid appointment changes were provided.' });
        return;
      }
      patch.updatedAt = new Date().toISOString();

      const updateMask = Object.keys(patch).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
      const updateResponse = await firestoreRequest(`/appointments/${encodeURIComponent(id)}?${updateMask}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, encodeValue(v)])) }),
      });
      if (!updateResponse.ok) throw new Error(`Appointment update rejected (${updateResponse.status}).`);
      const updated = await updateResponse.json() as FirestoreDoc;
      res.json({ appointment: decodeDocument(updated) });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status) res.status(status).json({ error: (error as Error).message });
      else sendError(res, error);
    }
  });
}
