import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BusinessProfile, DayHours, DayOfWeek, ServiceItem } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'businesses.json');

const DAYS: DayOfWeek[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

function createDefaultHours(overrides?: Partial<Record<DayOfWeek, Partial<DayHours>>>): DayHours[] {
  return DAYS.map((day) => ({
    day,
    open: '08:30',
    close: '19:00',
    closed: day === 'sunday',
    ...(overrides?.[day] ?? {}),
  }));
}

export const DEMO_BUSINESSES: BusinessProfile[] = [];

let writeLock: Promise<void> = Promise.resolve();

async function ensureStoreFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

async function readAllRaw(): Promise<BusinessProfile[]> {
  await ensureStoreFile();
  const content = await fs.readFile(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Reset to empty array if corrupted
  }
  await fs.writeFile(DB_FILE, JSON.stringify([], null, 2), 'utf8');
  return [];
}

async function writeAllAtomic(businesses: BusinessProfile[]): Promise<void> {
  await ensureStoreFile();
  const tmpPath = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(businesses, null, 2), 'utf8');
  await fs.rename(tmpPath, DB_FILE);
}

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'business';
}

function sanitizeService(item: Partial<ServiceItem>): ServiceItem {
  const price = Number(item.priceRwf);
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `srv-${crypto.randomUUID().slice(0, 8)}`,
    name: String(item.name ?? '').trim().slice(0, 120),
    priceRwf: Number.isFinite(price) && price >= 0 ? Math.round(price) : 0,
    durationOrUnit: String(item.durationOrUnit ?? '').trim().slice(0, 60),
    description: String(item.description ?? '').trim().slice(0, 300),
  };
}

function sanitizeHours(hours?: Partial<DayHours>[]): DayHours[] {
  const byDay = new Map<DayOfWeek, Partial<DayHours>>();
  if (Array.isArray(hours)) {
    for (const entry of hours) {
      if (entry && entry.day && DAYS.includes(entry.day)) {
        byDay.set(entry.day, entry);
      }
    }
  }
  return DAYS.map((day) => {
    const existing = byDay.get(day);
    return {
      day,
      open: typeof existing?.open === 'string' && existing.open.trim() ? existing.open.trim().slice(0, 10) : '08:30',
      close: typeof existing?.close === 'string' && existing.close.trim() ? existing.close.trim().slice(0, 10) : '18:00',
      closed: Boolean(existing?.closed),
    };
  });
}

export async function listBusinesses(): Promise<BusinessProfile[]> {
  return readAllRaw();
}

export async function getBusinessById(id: string): Promise<BusinessProfile | null> {
  const all = await readAllRaw();
  return all.find((b) => b.id === id) ?? null;
}

export async function createBusiness(input: Partial<BusinessProfile>): Promise<BusinessProfile> {
  return runSerialized(async () => {
    const all = await readAllRaw();
    const name = String(input.name ?? '').trim().slice(0, 120);
    if (!name) {
      throw new Error('Business name is required.');
    }

    const id = `biz-${crypto.randomUUID().slice(0, 10)}`;
    const baseSlug = slugify(name);
    const slug = all.some((b) => b.slug === baseSlug)
      ? `${baseSlug}-${id.slice(-4)}`
      : baseSlug;

    const created: BusinessProfile = {
      id,
      slug,
      name,
      category: String(input.category ?? 'Local Business').trim().slice(0, 80) || 'Local Business',
      isDemo: Boolean(input.isDemo),
      demoLabel: input.isDemo ? String(input.demoLabel ?? 'Demo Business').trim().slice(0, 60) : undefined,
      description: String(input.description ?? '').trim().slice(0, 500),
      address: String(input.address ?? '').trim().slice(0, 160),
      district: String(input.district ?? '').trim().slice(0, 80),
      city: String(input.city ?? 'Kigali, Rwanda').trim().slice(0, 80),
      phone: String(input.phone ?? '').trim().slice(0, 40),
      whatsappNumber: String(input.whatsappNumber ?? '').trim().slice(0, 40),
      email: String(input.email ?? '').trim().slice(0, 120),
      humanHandoffNote:
        String(input.humanHandoffNote ?? '').trim().slice(0, 300) ||
        'If a detail is not listed here, please reach our team directly on WhatsApp for human assistance.',
      hours: sanitizeHours(input.hours),
      services: Array.isArray(input.services)
        ? input.services.map(sanitizeService).filter((s) => s.name.length > 0)
        : [],
      updatedAt: new Date().toISOString(),
    };

    all.push(created);
    await writeAllAtomic(all);
    return created;
  });
}

export async function updateBusiness(
  id: string,
  patch: Partial<BusinessProfile>
): Promise<BusinessProfile | null> {
  return runSerialized(async () => {
    const all = await readAllRaw();
    const index = all.findIndex((b) => b.id === id);
    if (index === -1) {
      return null;
    }

    const current = all[index];
    const nextName =
      patch.name !== undefined ? String(patch.name).trim().slice(0, 120) : current.name;
    if (!nextName) {
      throw new Error('Business name cannot be empty.');
    }

    const updated: BusinessProfile = {
      ...current,
      id: current.id, // Immutable ID preserves strict separation
      slug: current.slug,
      name: nextName,
      category:
        patch.category !== undefined
          ? String(patch.category).trim().slice(0, 80)
          : current.category,
      isDemo: current.isDemo,
      demoLabel: current.demoLabel,
      description:
        patch.description !== undefined
          ? String(patch.description).trim().slice(0, 500)
          : current.description,
      address:
        patch.address !== undefined
          ? String(patch.address).trim().slice(0, 160)
          : current.address,
      district:
        patch.district !== undefined
          ? String(patch.district).trim().slice(0, 80)
          : current.district,
      city:
        patch.city !== undefined
          ? String(patch.city).trim().slice(0, 80)
          : current.city,
      phone:
        patch.phone !== undefined
          ? String(patch.phone).trim().slice(0, 40)
          : current.phone,
      whatsappNumber:
        patch.whatsappNumber !== undefined
          ? String(patch.whatsappNumber).trim().slice(0, 40)
          : current.whatsappNumber,
      email:
        patch.email !== undefined
          ? String(patch.email).trim().slice(0, 120)
          : current.email,
      humanHandoffNote:
        patch.humanHandoffNote !== undefined
          ? String(patch.humanHandoffNote).trim().slice(0, 300)
          : current.humanHandoffNote,
      hours: patch.hours !== undefined ? sanitizeHours(patch.hours) : current.hours,
      services:
        patch.services !== undefined
          ? patch.services.map(sanitizeService).filter((s) => s.name.length > 0)
          : current.services,
      updatedAt: new Date().toISOString(),
    };

    all[index] = updated;
    await writeAllAtomic(all);
    return updated;
  });
}

export async function deleteBusiness(id: string): Promise<{ deleted: boolean; reason?: string }> {
  return runSerialized(async () => {
    const all = await readAllRaw();
    const target = all.find((b) => b.id === id);
    if (!target) {
      return { deleted: false, reason: 'Business not found.' };
    }
    const filtered = all.filter((b) => b.id !== id);
    await writeAllAtomic(filtered);
    return { deleted: true };
  });
}
