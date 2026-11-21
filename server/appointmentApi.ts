import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { extractBearerToken, getFirebaseConfig, verifyFirebaseIdToken } from './auth.ts';
import { getFirestoreBusinessById } from './firestoreRest.ts';
import { AppointmentValidationError, parseServiceDurationMinutes, validateAppointmentRequest } from './appointments.ts';

const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(getFirebaseConfig().projectId)}/databases/(default)/documents`;
type Value = Record<string, unknown>;
type Doc = { name?: string; updateTime?: string; fields?: Record<string, Value> };

function encode(v: unknown): Value {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, encode(x)])) } };
  throw new Error('Unsupported Firestore value.');
}
function decode(v?: Value): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (((v.arrayValue as { values?: Value[] }).values) ?? []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries((v.mapValue as { fields?: Record<string, Value> }).fields ?? {}).map(([k, x]) => [k, decode(x)]));
  return undefined;
}
function unpack(doc: Doc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)]));
}
async function fsReq(path: string, token: string, init: RequestInit = {}): Promise<globalThis.Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${root}${path}`, { ...init, headers });
}
async function auth(req: Request) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const user = await verifyFirebaseIdToken(token);
  if (!user.emailVerified) throw Object.assign(new Error('A verified email account is required.'), { status: 403 });
  return { token, user };
}
function fail(res: Response, error: unknown) {
  const status = (error as { status?: number }).status;
  if (status) { res.status(status).json({ error: (error as Error).message }); return; }
  if (error instanceof AppointmentValidationError) { res.status(400).json({ error: error.message }); return; }
  console.error('Appointment API:', error);
  res.status(502).json({ error: 'The appointment service is temporarily unavailable.' });
}

export function registerAppointmentRoutes(app: Express) {
  app.post('/api/appointments', async (req, res) => {
    try {
      const { token, user } = await auth(req);
      const body = req.body ?? {};
      const businessId = typeof body.businessId === 'string' ? body.businessId : '';
      const business = await getFirestoreBusinessById(businessId, token);
      if (!business?.ownerId) { res.status(404).json({ error: 'Business not found.' }); return; }
      const requestedBy = body.requestedBy === 'owner' && user.uid === business.ownerId ? 'owner' : 'customer';
      if (body.requestedBy === 'owner' && requestedBy !== 'owner') { res.status(403).json({ error: 'Only the business owner can create an approved appointment.' }); return; }
      const input = validateAppointmentRequest({ ...body, customerUid: user.uid, requestedBy });
      const service = business.services.find((item) => item.id === input.serviceId);
      const duration = service ? parseServiceDurationMinutes(service.durationOrUnit) : null;
      if (!service || !duration || Date.parse(input.endAt) - Date.parse(input.startAt) !== duration * 60000) {
        res.status(400).json({ error: 'Select a valid service with a clearly configured duration.' }); return;
      }

      const id = `apt_${crypto.randomUUID().replace(/-/g, '')}`;
      const status = requestedBy === 'owner' ? 'confirmed' : 'pending';
      const data = {
        id, businessId, ownerId: business.ownerId, customerUid: user.uid,
        customerName: input.customerName, customerPhone: input.customerPhone,
        ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
        serviceId: input.serviceId, serviceName: service.name,
        startAt: input.startAt, endAt: input.endAt, timeZone: input.timeZone,
        language: input.language, requestedBy, status,
        notificationChannels: input.notificationChannels,
        ...(input.customerNote ? { customerNote: input.customerNote } : {}),
      };

      const begin = await fsReq(':beginTransaction', token, { method: 'POST', body: JSON.stringify({ options: { readWrite: {} } }) });
      if (!begin.ok) throw new Error(`Transaction start failed (${begin.status}).`);
      const { transaction } = await begin.json() as { transaction: string };
      const query = await fsReq(':runQuery', token, {
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
      if (!query.ok) throw new Error(`Appointment conflict check failed (${query.status}).`);
      const rows = await query.json() as Array<{ document?: Doc }>;
      const conflict = rows.some((row) => {
        if (!row.document) return false;
        const old = unpack(row.document);
        return ['pending', 'confirmed'].includes(String(old.status))
          && Date.parse(String(old.startAt)) < Date.parse(input.endAt)
          && Date.parse(String(old.endAt)) > Date.parse(input.startAt);
      });
      if (conflict) {
        await fsReq(':rollback', token, { method: 'POST', body: JSON.stringify({ transaction }) });
        res.status(409).json({ error: 'This time is already requested or booked. Please choose another time.' }); return;
      }
      const commit = await fsReq(':commit', token, {
        method: 'POST',
        body: JSON.stringify({
          transaction,
          writes: [{
            update: { name: `${root}/appointments/${id}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)])) },
            updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
            currentDocument: { exists: false },
          }],
        }),
      });
      if (!commit.ok) throw new Error(`Appointment save failed (${commit.status}).`);
      const now = new Date().toISOString();
      res.status(201).json({ appointment: { ...data, createdAt: now, updatedAt: now } });
    } catch (error) { fail(res, error); }
  });

  app.get('/api/appointments', async (req, res) => {
    try {
      const { token, user } = await auth(req);
      const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : '';
      let field = 'customerUid';
      let value = user.uid;
      if (businessId && req.query.scope !== 'customer') {
        const business = await getFirestoreBusinessById(businessId, token);
        if (!business || business.ownerId !== user.uid) { res.status(403).json({ error: 'You do not own this business.' }); return; }
        field = 'businessId'; value = businessId;
      }
      const response = await fsReq(':runQuery', token, {
        method: 'POST',
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'appointments' }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
          orderBy: [{ field: { fieldPath: 'startAt' }, direction: 'ASCENDING' }],
          limit: 250,
        } }),
      });
      if (!response.ok) throw new Error(`Appointment listing failed (${response.status}).`);
      const rows = await response.json() as Array<{ document?: Doc }>;
      res.json({ appointments: rows.filter((x) => x.document).map((x) => unpack(x.document!)) });
    } catch (error) { fail(res, error); }
  });

  app.patch('/api/appointments/:appointmentId', async (req, res) => {
    try {
      const { token, user } = await auth(req);
      const id = req.params.appointmentId;
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) { res.status(400).json({ error: 'Invalid appointment ID.' }); return; }
      const get = await fsReq(`/appointments/${encodeURIComponent(id)}`, token);
      if (get.status === 404) { res.status(404).json({ error: 'Appointment not found.' }); return; }
      if (!get.ok) throw new Error(`Appointment read failed (${get.status}).`);
      const doc = await get.json() as Doc;
      const current = unpack(doc);
      const business = await getFirestoreBusinessById(String(current.businessId), token);
      if (!business || business.ownerId !== user.uid || current.ownerId !== user.uid) { res.status(403).json({ error: 'Only the business owner can manage this appointment.' }); return; }

      const body = req.body ?? {};
      const allowed = ['confirmed', 'declined', 'cancelled', 'completed', 'no_show'];
      if (body.status !== undefined && !allowed.includes(body.status)) { res.status(400).json({ error: 'Invalid appointment status.' }); return; }
      const transitions: Record<string, string[]> = { pending: ['confirmed', 'declined', 'cancelled'], confirmed: ['cancelled', 'completed', 'no_show'] };
      if (body.status && !(transitions[String(current.status)] ?? []).includes(body.status)) { res.status(409).json({ error: 'This status transition is not allowed.' }); return; }

      const patch: Record<string, unknown> = {};
      if (body.status) patch.status = body.status;
      if (body.startAt !== undefined || body.endAt !== undefined) {
        if (current.status !== 'confirmed') { res.status(409).json({ error: 'Only confirmed appointments can be rescheduled.' }); return; }
        const start = Date.parse(String(body.startAt ?? current.startAt));
        const end = Date.parse(String(body.endAt ?? current.endAt));
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start || end - start > 86400000) { res.status(400).json({ error: 'Invalid rescheduled time.' }); return; }
        patch.startAt = new Date(start).toISOString(); patch.endAt = new Date(end).toISOString();
      }
      if (!Object.keys(patch).length) { res.status(400).json({ error: 'No changes supplied.' }); return; }
      const commit = await fsReq(':commit', token, {
        method: 'POST',
        body: JSON.stringify({ writes: [{
          update: { name: `${root}/appointments/${encodeURIComponent(id)}`, fields: Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, encode(v)])) },
          updateMask: { fieldPaths: Object.keys(patch) },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          currentDocument: { updateTime: doc.updateTime },
        }] }),
      });
      if (!commit.ok) throw new Error(`Appointment update failed (${commit.status}).`);
      res.json({ appointment: { ...current, ...patch, updatedAt: new Date().toISOString() } });
    } catch (error) { fail(res, error); }
  });
}
