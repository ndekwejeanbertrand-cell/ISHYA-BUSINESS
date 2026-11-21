import type { Language } from '../src/types.ts';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type AppointmentReminderOffset = '24h' | '1h' | '30m';
export type AppointmentNotificationChannel = 'whatsapp' | 'sms' | 'app';

export interface AppointmentRequest {
  businessId: string;
  serviceId: string;
  customerUid: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  language: Language;
  requestedBy: 'customer' | 'owner';
  notificationChannels: AppointmentNotificationChannel[];
  customerNote?: string;
}

export interface AppointmentReminderJob {
  appointmentId: string;
  businessId: string;
  customerUid: string;
  offset: AppointmentReminderOffset;
  scheduledAt: string;
  channels: AppointmentNotificationChannel[];
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const REMINDER_OFFSETS: ReadonlyArray<{
  offset: AppointmentReminderOffset;
  milliseconds: number;
}> = [
  { offset: '24h', milliseconds: 24 * 60 * 60 * 1000 },
  { offset: '1h', milliseconds: 60 * 60 * 1000 },
  { offset: '30m', milliseconds: 30 * 60 * 1000 },
];

export class AppointmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppointmentValidationError';
  }
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Accept only explicit, positive durations. Values such as "Unit" are not
 * interpreted as minutes; callers must ask the business to configure them.
 */
export function parseServiceDurationMinutes(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const minuteMatch = normalized.match(/^(\d{1,4})\s*(m|min|mins|minute|minutes)$/);
  if (minuteMatch) {
    const minutes = Number(minuteMatch[1]);
    return minutes >= 1 && minutes <= 1440 ? minutes : null;
  }

  const hourMatch = normalized.match(/^(\d{1,2})\s*(h|hr|hrs|hour|hours)$/);
  if (hourMatch) {
    const minutes = Number(hourMatch[1]) * 60;
    return minutes >= 1 && minutes <= 1440 ? minutes : null;
  }

  return null;
}

export function validateAppointmentRequest(
  input: unknown,
  now = Date.now()
): AppointmentRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppointmentValidationError('Appointment details are required.');
  }

  const data = input as Record<string, unknown>;
  const requiredString = (key: string, maxLength: number): string => {
    const value = data[key];
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
      throw new AppointmentValidationError(`Invalid ${key}.`);
    }
    return value.trim();
  };

  const businessId = requiredString('businessId', 128);
  const serviceId = requiredString('serviceId', 128);
  const customerUid = requiredString('customerUid', 128);
  const customerName = requiredString('customerName', 120);
  const customerPhone = requiredString('customerPhone', 16);
  const startAt = requiredString('startAt', 40);
  const endAt = requiredString('endAt', 40);
  const timeZone = requiredString('timeZone', 64);

  if (!ID_PATTERN.test(businessId) || !ID_PATTERN.test(serviceId) || !ID_PATTERN.test(customerUid)) {
    throw new AppointmentValidationError('Invalid business, service, or customer identifier.');
  }
  if (!E164_PATTERN.test(customerPhone)) {
    throw new AppointmentValidationError('Customer phone must use international E.164 format.');
  }
  if (!isValidTimeZone(timeZone)) {
    throw new AppointmentValidationError('A valid IANA time zone is required.');
  }

  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new AppointmentValidationError('Appointment start and end times are invalid.');
  }
  if (startMs <= now) {
    throw new AppointmentValidationError('Appointment must be scheduled in the future.');
  }
  if (endMs - startMs > 24 * 60 * 60 * 1000) {
    throw new AppointmentValidationError('Appointment duration cannot exceed 24 hours.');
  }

  const requestedBy = data.requestedBy;
  if (requestedBy !== 'customer' && requestedBy !== 'owner') {
    throw new AppointmentValidationError('Invalid appointment requester.');
  }

  const language = data.language;
  if (language !== 'rw' && language !== 'en' && language !== 'fr') {
    throw new AppointmentValidationError('Unsupported appointment language.');
  }

  const rawChannels = data.notificationChannels;
  if (!Array.isArray(rawChannels) || rawChannels.length === 0) {
    throw new AppointmentValidationError('Choose at least one reminder channel.');
  }
  const allowedChannels = new Set<AppointmentNotificationChannel>(['whatsapp', 'sms', 'app']);
  const notificationChannels = [...new Set(rawChannels)].filter(
    (channel): channel is AppointmentNotificationChannel =>
      typeof channel === 'string' && allowedChannels.has(channel as AppointmentNotificationChannel)
  );
  if (notificationChannels.length !== rawChannels.length) {
    throw new AppointmentValidationError('One or more reminder channels are invalid.');
  }

  const customerEmail =
    typeof data.customerEmail === 'string' && data.customerEmail.trim()
      ? data.customerEmail.trim().slice(0, 160)
      : undefined;
  const customerNote =
    typeof data.customerNote === 'string' && data.customerNote.trim()
      ? data.customerNote.trim().slice(0, 500)
      : undefined;

  return {
    businessId,
    serviceId,
    customerUid,
    customerName,
    customerPhone,
    ...(customerEmail ? { customerEmail } : {}),
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    timeZone,
    language,
    requestedBy,
    notificationChannels,
    ...(customerNote ? { customerNote } : {}),
  };
}

/**
 * Creates reminder jobs only for confirmed appointments. Past reminder
 * deadlines are omitted instead of being sent late as surprise messages.
 */
export function buildAppointmentReminderJobs(
  appointment: {
    id: string;
    businessId: string;
    customerUid: string;
    startAt: string;
    status: AppointmentStatus;
    notificationChannels: AppointmentNotificationChannel[];
  },
  now = Date.now()
): AppointmentReminderJob[] {
  if (appointment.status !== 'confirmed') return [];

  const startMs = Date.parse(appointment.startAt);
  if (!Number.isFinite(startMs) || !appointment.id || !appointment.businessId) return [];

  return REMINDER_OFFSETS
    .map(({ offset, milliseconds }) => ({
      appointmentId: appointment.id,
      businessId: appointment.businessId,
      customerUid: appointment.customerUid,
      offset,
      scheduledAt: new Date(startMs - milliseconds).toISOString(),
      channels: [...appointment.notificationChannels],
      status: 'pending' as const,
    }))
    .filter((job) => Date.parse(job.scheduledAt) > now);
}
