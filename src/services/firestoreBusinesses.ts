import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  isOfflineOrUnavailableError,
  restCreateOwnerBusiness,
  restDeleteOwnerBusiness,
  restEnsureOwnerProfile,
  restGetWhatsAppIntegration,
  restListOwnerBusinesses,
  restSaveWhatsAppIntegration,
  restUpdateOwnerBusiness,
} from './firestoreRestClient';
import type {
  BusinessProfile,
  DayHours,
  DayOfWeek,
  Language,
  ServiceItem,
  WhatsAppIntegrationConfig,
} from '../types';

const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function createDefaultHours(): DayHours[] {
  return DAYS.map((day) => ({
    day,
    open: '08:30',
    close: '19:00',
    closed: day === 'sunday',
  }));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'business'
  );
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') {
    return val;
  }
  return new Date().toISOString();
}

function sanitizeHours(hours?: Partial<DayHours>[]): DayHours[] {
  const byDay = new Map<DayOfWeek, Partial<DayHours>>();
  if (Array.isArray(hours)) {
    for (const h of hours) {
      if (h?.day && DAYS.includes(h.day)) {
        byDay.set(h.day, h);
      }
    }
  }
  return DAYS.map((day) => {
    const row = byDay.get(day);
    return {
      day,
      open: typeof row?.open === 'string' && row.open.trim() ? row.open.trim().slice(0, 10) : '08:30',
      close: typeof row?.close === 'string' && row.close.trim() ? row.close.trim().slice(0, 10) : '19:00',
      closed: Boolean(row?.closed),
    };
  });
}

function sanitizeServices(services?: Partial<ServiceItem>[]): ServiceItem[] {
  if (!Array.isArray(services)) return [];
  return services
    .slice(0, 50)
    .map((s, idx) => ({
      id: typeof s.id === 'string' && s.id.trim() ? s.id.trim().slice(0, 64) : `srv-${Date.now()}-${idx}`,
      name: String(s.name ?? '').trim().slice(0, 120),
      priceRwf: Math.max(0, Math.round(Number(s.priceRwf) || 0)),
      durationOrUnit: String(s.durationOrUnit ?? '').trim().slice(0, 60),
      description: String(s.description ?? '').trim().slice(0, 300),
    }))
    .filter((s) => s.name.length > 0);
}

const OWNER_BUSINESSES_REFRESH_EVENT = 'ishya:owner-businesses-refresh';

function notifyOwnerBusinessesChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OWNER_BUSINESSES_REFRESH_EVENT));
  }
}

const ownerProfileSyncInFlight = new Map<string, Promise<void>>();

async function ensureOwnerProfileViaSdk(
  user: User,
  displayName: string,
  email: string,
  preferredLanguage: Language
): Promise<void> {
  const ref = doc(db, 'owners', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        uid: user.uid,
        displayName,
        email,
        preferredLanguage,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (writeErr) {
      const code =
        typeof writeErr === 'object' && writeErr !== null && 'code' in writeErr
          ? String((writeErr as { code?: unknown }).code)
          : '';
      if (code === 'permission-denied' || code === 'already-exists') {
        const latestSnap = await getDoc(ref);
        if (latestSnap.exists()) {
          await updateDoc(ref, {
            displayName,
            preferredLanguage,
            updatedAt: serverTimestamp(),
          });
          return;
        }
      }
      throw writeErr;
    }
  } else {
    await updateDoc(ref, {
      displayName,
      preferredLanguage,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function ensureOwnerProfile(
  user: User,
  preferredLanguage: Language
): Promise<void> {
  const existingSync = ownerProfileSyncInFlight.get(user.uid);
  if (existingSync) {
    return existingSync;
  }

  const syncPromise = (async () => {
    const path = `owners/${user.uid}`;
    const displayName = (user.displayName || user.email || 'Business Owner').slice(0, 120);
    const email = (user.email || '').slice(0, 160);

    try {
      if (!user.emailVerified) {
        throw new Error('Your Google account email must be verified before creating an owner profile.');
      }

      try {
        await ensureOwnerProfileViaSdk(user, displayName, email, preferredLanguage);
      } catch (sdkErr) {
        if (!isOfflineOrUnavailableError(sdkErr)) {
          throw sdkErr;
        }
        // Retry once after transport warm-up, then fall back to authenticated Firestore REST API
        await new Promise((resolve) => setTimeout(resolve, 600));
        try {
          await ensureOwnerProfileViaSdk(user, displayName, email, preferredLanguage);
        } catch (retryErr) {
          if (!isOfflineOrUnavailableError(retryErr)) {
            throw retryErr;
          }
          await restEnsureOwnerProfile(user, displayName, email, preferredLanguage);
          notifyOwnerBusinessesChanged();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  })().finally(() => {
    ownerProfileSyncInFlight.delete(user.uid);
  });

  ownerProfileSyncInFlight.set(user.uid, syncPromise);
  return syncPromise;
}

export function subscribeOwnerBusinesses(
  ownerId: string,
  onData: (businesses: BusinessProfile[]) => void,
  onError: (err: Error) => void
): () => void {
  const path = 'businesses';
  const q = query(collection(db, path), where('ownerId', '==', ownerId));
  let unsubscribed = false;

  const refreshViaRest = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== ownerId || unsubscribed) {
      return false;
    }
    try {
      const items = await restListOwnerBusinesses(currentUser);
      if (!unsubscribed) {
        onData(items);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleRefreshEvent = () => {
    void refreshViaRest();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(OWNER_BUSINESSES_REFRESH_EVENT, handleRefreshEvent);
  }

  const unsubSnapshot = onSnapshot(
    q,
    (snapshot) => {
      const items: BusinessProfile[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id ?? d.id),
          ownerId: String(data.ownerId ?? ownerId),
          slug: String(data.slug ?? d.id),
          name: String(data.name ?? ''),
          category: String(data.category ?? 'Local Business'),
          isDemo: Boolean(data.isDemo),
          isPublished: Boolean(data.isPublished),
          demoLabel: typeof data.demoLabel === 'string' ? data.demoLabel : undefined,
          description: String(data.description ?? ''),
          address: String(data.address ?? ''),
          countryCode: typeof data.countryCode === 'string' ? data.countryCode : undefined,
          countryName: typeof data.countryName === 'string' ? data.countryName : undefined,
          region: typeof data.region === 'string' ? data.region : undefined,
          district: String(data.district ?? ''),
          sector: String(data.sector ?? ''),
          city: String(data.city ?? ''),
          phone: String(data.phone ?? ''),
          whatsappNumber: String(data.whatsappNumber ?? ''),
          email: String(data.email ?? ''),
          humanHandoffNote: String(data.humanHandoffNote ?? ''),
          hours: sanitizeHours(data.hours),
          services: sanitizeServices(data.services),
          createdAt: toIsoString(data.createdAt),
          updatedAt: toIsoString(data.updatedAt),
        };
      });
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(items);
    },
    (error) => {
      void (async () => {
        if (isOfflineOrUnavailableError(error)) {
          const recovered = await refreshViaRest();
          if (recovered || unsubscribed) return;
        }
        try {
          handleFirestoreError(error, OperationType.LIST, path);
        } catch (wrapped) {
          if (!unsubscribed) {
            onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        }
      })();
    }
  );

  return () => {
    unsubscribed = true;
    unsubSnapshot();
    if (typeof window !== 'undefined') {
      window.removeEventListener(OWNER_BUSINESSES_REFRESH_EVENT, handleRefreshEvent);
    }
  };
}

export async function createOwnerBusiness(
  ownerId: string,
  input: Partial<BusinessProfile>
): Promise<BusinessProfile> {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  const id = `biz_${Date.now().toString(36)}_${randomSuffix}`;
  const path = `businesses/${id}`;
  const name = String(input.name ?? '').trim().slice(0, 120);
  if (!name) {
    throw new Error('Business name is required.');
  }
  const category = String(input.category ?? '').trim().slice(0, 80);
  if (!category) {
    throw new Error('Business category is required.');
  }
  const countryCode = (String(input.countryCode ?? 'RW').trim().toUpperCase() || 'RW').slice(0, 8);
  const countryName = (String(input.countryName ?? '').trim() || (countryCode === 'RW' ? 'Rwanda' : countryCode)).slice(0, 100);
  const region = String(input.region ?? '').trim().slice(0, 100);
  const district = String(input.district ?? '').trim().slice(0, 80);
  const sector = String(input.sector ?? '').trim().slice(0, 80);
  const city = String(input.city ?? '').trim().slice(0, 80);
  if (!city) {
    throw new Error('Business city is required.');
  }
  const slug = `${slugify(name)}-${randomSuffix.slice(0, 4)}`;

  const baseFields = {
    id,
    ownerId,
    slug,
    name,
    category,
    isDemo: false,
    isPublished: Boolean(input.isPublished ?? true),
    description: String(input.description ?? '').trim().slice(0, 500),
    address: String(input.address ?? '').trim().slice(0, 160),
    countryCode,
    countryName,
    region,
    district,
    sector,
    city,
    phone: String(input.phone ?? '').trim().slice(0, 40),
    whatsappNumber: String(input.whatsappNumber ?? '').trim().slice(0, 40),
    email: String(input.email ?? '').trim().slice(0, 120),
    humanHandoffNote:
      String(input.humanHandoffNote ?? '').trim().slice(0, 300) ||
      'For details not listed here, tap Chat on WhatsApp to speak directly with our team.',
    hours: sanitizeHours(input.hours ?? createDefaultHours()),
    services: sanitizeServices(input.services),
  };

  try {
    try {
      await setDoc(doc(db, 'businesses', id), {
        ...baseFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (sdkErr) {
      const currentUser = auth.currentUser;
      if (isOfflineOrUnavailableError(sdkErr) && currentUser?.uid === ownerId) {
        await restCreateOwnerBusiness(currentUser, baseFields);
        notifyOwnerBusinessesChanged();
      } else {
        throw sdkErr;
      }
    }
    return {
      ...baseFields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateOwnerBusiness(
  business: BusinessProfile
): Promise<void> {
  const path = `businesses/${business.id}`;
  const name = business.name.trim().slice(0, 120);
  if (!name) {
    throw new Error('Business name cannot be empty.');
  }
  const category = business.category.trim().slice(0, 80);
  if (!category) {
    throw new Error('Business category cannot be empty.');
  }

  const countryCode = (String(business.countryCode ?? 'RW').trim().toUpperCase() || 'RW').slice(0, 8);
  const countryName = (String(business.countryName ?? '').trim() || (countryCode === 'RW' ? 'Rwanda' : countryCode)).slice(0, 100);
  const region = (business.region ?? '').trim().slice(0, 100);
  const district = business.district.trim().slice(0, 80);
  const sector = (business.sector ?? '').trim().slice(0, 80);
  const city = business.city.trim().slice(0, 80);
  const updateFields = {
    name,
    category,
    isPublished: Boolean(business.isPublished),
    description: business.description.trim().slice(0, 500),
    address: business.address.trim().slice(0, 160),
    countryCode,
    countryName,
    region,
    district,
    sector,
    city,
    phone: business.phone.trim().slice(0, 40),
    whatsappNumber: business.whatsappNumber.trim().slice(0, 40),
    email: business.email.trim().slice(0, 120),
    humanHandoffNote: business.humanHandoffNote.trim().slice(0, 300),
    hours: sanitizeHours(business.hours),
    services: sanitizeServices(business.services),
  };

  try {
    try {
      await updateDoc(doc(db, 'businesses', business.id), {
        ...updateFields,
        updatedAt: serverTimestamp(),
      });
    } catch (sdkErr) {
      const currentUser = auth.currentUser;
      if (isOfflineOrUnavailableError(sdkErr) && currentUser) {
        await restUpdateOwnerBusiness(currentUser, business.id, updateFields);
        notifyOwnerBusinessesChanged();
      } else {
        throw sdkErr;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOwnerBusiness(businessId: string): Promise<void> {
  const path = `businesses/${businessId}`;
  try {
    try {
      await deleteDoc(doc(db, 'businesses', businessId));
    } catch (sdkErr) {
      const currentUser = auth.currentUser;
      if (isOfflineOrUnavailableError(sdkErr) && currentUser) {
        await restDeleteOwnerBusiness(currentUser, businessId);
        notifyOwnerBusinessesChanged();
      } else {
        throw sdkErr;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function getWhatsAppIntegration(
  businessId: string,
  ownerId: string
): Promise<WhatsAppIntegrationConfig> {
  const path = `businesses/${businessId}/integrations/whatsapp`;
  try {
    try {
      const snap = await getDoc(doc(db, 'businesses', businessId, 'integrations', 'whatsapp'));
      if (!snap.exists()) {
        return {
          businessId,
          ownerId,
          phoneNumberId: '',
          displayPhoneNumber: '',
          webhookEnabled: false,
        };
      }
      const data = snap.data();
      return {
        businessId,
        ownerId: String(data.ownerId ?? ownerId),
        phoneNumberId: String(data.phoneNumberId ?? ''),
        displayPhoneNumber: String(data.displayPhoneNumber ?? ''),
        webhookEnabled: Boolean(data.webhookEnabled),
      };
    } catch (sdkErr) {
      const currentUser = auth.currentUser;
      if (isOfflineOrUnavailableError(sdkErr) && currentUser) {
        return await restGetWhatsAppIntegration(currentUser, businessId, ownerId);
      }
      throw sdkErr;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveWhatsAppIntegration(
  config: WhatsAppIntegrationConfig,
  idToken: string
): Promise<void> {
  const path = `businesses/${config.businessId}/integrations/whatsapp`;
  const cleanPhoneId = config.phoneNumberId.trim().slice(0, 64);
  const cleanDisplay = config.displayPhoneNumber.trim().slice(0, 40);
  const enabled = Boolean(config.webhookEnabled && cleanPhoneId);

  try {
    try {
      const ref = doc(db, 'businesses', config.businessId, 'integrations', 'whatsapp');
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          businessId: config.businessId,
          ownerId: config.ownerId,
          phoneNumberId: cleanPhoneId,
          displayPhoneNumber: cleanDisplay,
          webhookEnabled: enabled,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(ref, {
          phoneNumberId: cleanPhoneId,
          displayPhoneNumber: cleanDisplay,
          webhookEnabled: enabled,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (sdkErr) {
      if (isOfflineOrUnavailableError(sdkErr)) {
        await restSaveWhatsAppIntegration(
          idToken,
          config,
          cleanPhoneId,
          cleanDisplay,
          enabled
        );
      } else {
        throw sdkErr;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }

  const res = await fetch('/api/whatsapp/register-route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      businessId: config.businessId,
      phoneNumberId: cleanPhoneId,
      displayPhoneNumber: cleanDisplay,
      webhookEnabled: enabled,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not register WhatsApp webhook route.');
  }
}
