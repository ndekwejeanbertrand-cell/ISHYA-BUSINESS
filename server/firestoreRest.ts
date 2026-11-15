import type { BusinessProfile, DayHours, DayOfWeek, ServiceItem } from '../src/types.ts';
import { getFirebaseConfig } from './auth.ts';

type FirestoreValue =
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}

function fromFirestoreValue(val?: FirestoreValue): unknown {
  if (!val) return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values ?? []).map((item) => fromFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields ?? {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
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

function docToBusiness(doc: FirestoreDocument): BusinessProfile | null {
  const fields = doc.fields;
  if (!fields) return null;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    raw[k] = fromFirestoreValue(v);
  }
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') {
    return null;
  }

  const hoursRaw = Array.isArray(raw.hours) ? raw.hours : [];
  const hours: DayHours[] = hoursRaw
    .map((h) => {
      const obj = (h ?? {}) as Record<string, unknown>;
      const day = VALID_DAYS.includes(obj.day as DayOfWeek) ? (obj.day as DayOfWeek) : 'monday';
      return {
        day,
        open: typeof obj.open === 'string' ? obj.open : '08:30',
        close: typeof obj.close === 'string' ? obj.close : '18:00',
        closed: Boolean(obj.closed),
      };
    });

  const servicesRaw = Array.isArray(raw.services) ? raw.services : [];
  const services: ServiceItem[] = servicesRaw.map((s, idx) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    return {
      id: typeof obj.id === 'string' ? obj.id : `srv-${idx}`,
      name: typeof obj.name === 'string' ? obj.name : '',
      priceRwf: Number(obj.priceRwf) || 0,
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
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function getFirestoreBaseUrl(): string {
  const { projectId, firestoreDatabaseId } = getFirebaseConfig();
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents`;
}

export async function getFirestoreBusinessById(
  businessId: string,
  idToken?: string
): Promise<BusinessProfile | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(businessId)) {
    return null;
  }
  const url = `${getFirestoreBaseUrl()}/businesses/${encodeURIComponent(businessId)}`;
  const headers: Record<string, string> = {};
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  const response = await fetch(url, { headers });
  if (response.status === 404 || response.status === 403) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Firestore read failed (${response.status}).`);
  }
  const doc = (await response.json()) as FirestoreDocument;
  return docToBusiness(doc);
}

export async function listPublishedFirestoreBusinesses(): Promise<BusinessProfile[]> {
  const url = `${getFirestoreBaseUrl()}:runQuery`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'businesses' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'isPublished' },
            op: 'EQUAL',
            value: { booleanValue: true },
          },
        },
        limit: 50,
      },
    }),
  });

  if (!response.ok) {
    return [];
  }

  const rows = (await response.json()) as Array<{ document?: FirestoreDocument }>;
  const results: BusinessProfile[] = [];
  for (const row of rows) {
    if (row.document) {
      const parsed = docToBusiness(row.document);
      if (parsed) {
        results.push(parsed);
      }
    }
  }
  return results;
}
