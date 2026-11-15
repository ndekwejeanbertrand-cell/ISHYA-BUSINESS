import type { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  BusinessProfile,
  DayHours,
  DayOfWeek,
  Language,
  ServiceItem,
  WhatsAppIntegrationConfig,
} from '../types';

type FirestoreRestValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

interface FirestoreRestDoc {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
}

const VALID_DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function getBaseDocumentsUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;
}

function getDocumentResourceName(relativePath: string): string {
  return `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/${relativePath}`;
}

export function isOfflineOrUnavailableError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  const msg =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    code === 'unavailable' ||
    code.includes('unavailable') ||
    msg.includes('the client is offline') ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network-request-failed')
  );
}

export function toFirestoreRestValue(value: unknown): FirestoreRestValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreRestValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, FirestoreRestValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFirestoreRestValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreRestValue(val?: FirestoreRestValue): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map((item) => fromFirestoreRestValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromFirestoreRestValue(v);
    }
    return out;
  }
  return undefined;
}

function parseBusinessDoc(doc: FirestoreRestDoc): BusinessProfile | null {
  if (!doc.fields) return null;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    raw[k] = fromFirestoreRestValue(v);
  }
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const hoursRaw = Array.isArray(raw.hours) ? raw.hours : [];
  const hours: DayHours[] = VALID_DAYS.map((day) => {
    const found = hoursRaw.find((h) => (h as Record<string, unknown>)?.day === day) as
      | Record<string, unknown>
      | undefined;
    return {
      day,
      open: typeof found?.open === 'string' && found.open ? found.open : '08:30',
      close: typeof found?.close === 'string' && found.close ? found.close : '19:00',
      closed: found ? Boolean(found.closed) : day === 'sunday',
    };
  });

  const servicesRaw = Array.isArray(raw.services) ? raw.services : [];
  const services: ServiceItem[] = servicesRaw.map((s, idx) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    return {
      id: typeof obj.id === 'string' && obj.id ? obj.id : `srv-${idx}`,
      name: typeof obj.name === 'string' ? obj.name : '',
      priceRwf: Math.max(0, Math.round(Number(obj.priceRwf) || 0)),
      durationOrUnit: typeof obj.durationOrUnit === 'string' ? obj.durationOrUnit : '',
      description: typeof obj.description === 'string' ? obj.description : '',
    };
  });

  return {
    id: raw.id,
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : undefined,
    slug: typeof raw.slug === 'string' ? raw.slug : raw.id,
    name: raw.name,
    category: typeof raw.category === 'string' ? raw.category : 'Local Business',
    isDemo: Boolean(raw.isDemo),
    isPublished: Boolean(raw.isPublished),
    demoLabel: typeof raw.demoLabel === 'string' ? raw.demoLabel : undefined,
    description: typeof raw.description === 'string' ? raw.description : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : undefined,
    countryName: typeof raw.countryName === 'string' ? raw.countryName : undefined,
    region: typeof raw.region === 'string' ? raw.region : undefined,
    district: typeof raw.district === 'string' ? raw.district : '',
    sector: typeof raw.sector === 'string' ? raw.sector : '',
    city: typeof raw.city === 'string' ? raw.city : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    whatsappNumber: typeof raw.whatsappNumber === 'string' ? raw.whatsappNumber : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    humanHandoffNote: typeof raw.humanHandoffNote === 'string' ? raw.humanHandoffNote : '',
    hours,
    services,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updatedAt:
      typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

async function parseRestError(response: Response): Promise<Error> {
  const text = await response.text().catch(() => '');
  try {
    const json = JSON.parse(text) as { error?: { message?: string; status?: string } };
    const msg = json?.error?.message || text || `Firestore REST error (${response.status})`;
    const err = new Error(msg) as Error & { code?: string };
    if (response.status === 403) {
      err.code = 'permission-denied';
    } else if (response.status === 401) {
      err.code = 'unauthenticated';
    }
    return err;
  } catch {
    return new Error(text || `Firestore REST error (${response.status})`);
  }
}

export async function checkFirestoreRestReachable(): Promise<boolean> {
  try {
    const res = await fetch(
      `${getBaseDocumentsUrl()}/test/connection?key=${encodeURIComponent(
        firebaseConfig.apiKey
      )}`
    );
    // 200, 403 (PERMISSION_DENIED by rules), or 404 all confirm Firestore backend is reachable
    return res.status === 200 || res.status === 403 || res.status === 404;
  } catch {
    return false;
  }
}

export async function restEnsureOwnerProfile(
  user: User,
  displayName: string,
  email: string,
  preferredLanguage: Language
): Promise<void> {
  const idToken = await user.getIdToken();
  const baseUrl = getBaseDocumentsUrl();
  const docUrl = `${baseUrl}/owners/${encodeURIComponent(user.uid)}?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
  const commitUrl = `${baseUrl}:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const docName = getDocumentResourceName(`owners/${user.uid}`);

  const getRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (getRes.status === 404) {
    const createRes = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docName,
              fields: {
                uid: { stringValue: user.uid },
                displayName: { stringValue: displayName },
                email: { stringValue: email },
                preferredLanguage: { stringValue: preferredLanguage },
              },
            },
            updateTransforms: [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
            currentDocument: { exists: false },
          },
        ],
      }),
    });

    if (createRes.ok) return;

    // Handle concurrent create race cleanly by retrying as an update
    if (createRes.status === 409 || createRes.status === 400) {
      const retryUpdateRes = await fetch(commitUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: docName,
                fields: {
                  displayName: { stringValue: displayName },
                  preferredLanguage: { stringValue: preferredLanguage },
                },
              },
              updateMask: {
                fieldPaths: ['displayName', 'preferredLanguage'],
              },
              updateTransforms: [
                { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
              ],
              currentDocument: { exists: true },
            },
          ],
        }),
      });
      if (retryUpdateRes.ok) return;
      throw await parseRestError(retryUpdateRes);
    }

    throw await parseRestError(createRes);
  }

  if (!getRes.ok) {
    throw await parseRestError(getRes);
  }

  const updateRes = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields: {
              displayName: { stringValue: displayName },
              preferredLanguage: { stringValue: preferredLanguage },
            },
          },
          updateMask: {
            fieldPaths: ['displayName', 'preferredLanguage'],
          },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: true },
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    throw await parseRestError(updateRes);
  }
}

export async function restListOwnerBusinesses(
  user: User
): Promise<BusinessProfile[]> {
  const idToken = await user.getIdToken();
  const res = await fetch(
    `${getBaseDocumentsUrl()}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'businesses' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'ownerId' },
              op: 'EQUAL',
              value: { stringValue: user.uid },
            },
          },
        },
      }),
    }
  );

  if (!res.ok) {
    throw await parseRestError(res);
  }

  const rows = (await res.json()) as Array<{ document?: FirestoreRestDoc }>;
  const items: BusinessProfile[] = [];
  for (const row of rows) {
    if (row.document) {
      const parsed = parseBusinessDoc(row.document);
      if (parsed) {
        items.push(parsed);
      }
    }
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items;
}

export async function restCreateOwnerBusiness(
  user: User,
  payload: Omit<BusinessProfile, 'createdAt' | 'updatedAt'> & { ownerId: string }
): Promise<void> {
  const idToken = await user.getIdToken();
  const commitUrl = `${getBaseDocumentsUrl()}:commit?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
  const docName = getDocumentResourceName(`businesses/${payload.id}`);
  const fieldsMap = toFirestoreRestValue(payload);
  const fields =
    'mapValue' in fieldsMap && fieldsMap.mapValue.fields
      ? fieldsMap.mapValue.fields
      : {};

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields,
          },
          updateTransforms: [
            { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: false },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw await parseRestError(res);
  }
}

export async function restUpdateOwnerBusiness(
  user: User,
  businessId: string,
  fieldsObj: Record<string, unknown>
): Promise<void> {
  const idToken = await user.getIdToken();
  const commitUrl = `${getBaseDocumentsUrl()}:commit?key=${encodeURIComponent(
    firebaseConfig.apiKey
  )}`;
  const docName = getDocumentResourceName(`businesses/${businessId}`);
  const fieldsMap = toFirestoreRestValue(fieldsObj);
  const fields =
    'mapValue' in fieldsMap && fieldsMap.mapValue.fields
      ? fieldsMap.mapValue.fields
      : {};

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields,
          },
          updateMask: {
            fieldPaths: Object.keys(fieldsObj),
          },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: true },
        },
      ],
    }),
  });

  if (!res.ok) {
    throw await parseRestError(res);
  }
}

export async function restDeleteOwnerBusiness(
  user: User,
  businessId: string
): Promise<void> {
  const idToken = await user.getIdToken();
  const res = await fetch(
    `${getBaseDocumentsUrl()}/businesses/${encodeURIComponent(
      businessId
    )}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }
  );
  if (!res.ok) {
    throw await parseRestError(res);
  }
}

export async function restGetWhatsAppIntegration(
  user: User,
  businessId: string,
  ownerId: string
): Promise<WhatsAppIntegrationConfig> {
  const idToken = await user.getIdToken();
  const res = await fetch(
    `${getBaseDocumentsUrl()}/businesses/${encodeURIComponent(
      businessId
    )}/integrations/whatsapp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    }
  );
  if (res.status === 404) {
    return {
      businessId,
      ownerId,
      phoneNumberId: '',
      displayPhoneNumber: '',
      webhookEnabled: false,
    };
  }
  if (!res.ok) {
    throw await parseRestError(res);
  }
  const doc = (await res.json()) as FirestoreRestDoc;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    raw[k] = fromFirestoreRestValue(v);
  }
  return {
    businessId,
    ownerId: String(raw.ownerId ?? ownerId),
    phoneNumberId: String(raw.phoneNumberId ?? ''),
    displayPhoneNumber: String(raw.displayPhoneNumber ?? ''),
    webhookEnabled: Boolean(raw.webhookEnabled),
  };
}

export async function restSaveWhatsAppIntegration(
  idToken: string,
  config: WhatsAppIntegrationConfig,
  phoneNumberId: string,
  displayPhoneNumber: string,
  webhookEnabled: boolean
): Promise<void> {
  const baseUrl = getBaseDocumentsUrl();
  const docUrl = `${baseUrl}/businesses/${encodeURIComponent(
    config.businessId
  )}/integrations/whatsapp?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const commitUrl = `${baseUrl}:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const docName = getDocumentResourceName(
    `businesses/${config.businessId}/integrations/whatsapp`
  );

  const getRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (getRes.status === 404) {
    const createRes = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docName,
              fields: {
                businessId: { stringValue: config.businessId },
                ownerId: { stringValue: config.ownerId },
                phoneNumberId: { stringValue: phoneNumberId },
                displayPhoneNumber: { stringValue: displayPhoneNumber },
                webhookEnabled: { booleanValue: webhookEnabled },
              },
            },
            updateTransforms: [
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
            currentDocument: { exists: false },
          },
        ],
      }),
    });
    if (!createRes.ok) {
      throw await parseRestError(createRes);
    }
    return;
  }

  if (!getRes.ok) {
    throw await parseRestError(getRes);
  }

  const updateRes = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: docName,
            fields: {
              phoneNumberId: { stringValue: phoneNumberId },
              displayPhoneNumber: { stringValue: displayPhoneNumber },
              webhookEnabled: { booleanValue: webhookEnabled },
            },
          },
          updateMask: {
            fieldPaths: ['phoneNumberId', 'displayPhoneNumber', 'webhookEnabled'],
          },
          updateTransforms: [
            { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
          ],
          currentDocument: { exists: true },
        },
      ],
    }),
  });
  if (!updateRes.ok) {
    throw await parseRestError(updateRes);
  }
}
