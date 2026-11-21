import type { Language } from '../src/types.ts';

export interface IntouchSmsConfig {
  username?: string;
  password?: string;
  senderId?: string;
}

export interface AppointmentSmsInput {
  customerName: string;
  serviceName: string;
  businessName: string;
  startAt: string;
  timeZone: string;
  language: Language;
}

export function buildIntouchAppointmentSmsMessage(input: AppointmentSmsInput): string {
  const date = new Date(input.startAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid appointment reminder date.');
  const dateTime = new Intl.DateTimeFormat(
    input.language === 'rw' ? 'rw-RW' : input.language === 'fr' ? 'fr-FR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: input.timeZone }
  ).format(date);
  const values = [input.customerName, input.serviceName, input.businessName];
  if (values.some((value) => !value?.trim() || value.length > 120)) {
    throw new Error('Appointment SMS details are incomplete.');
  }
  if (input.language === 'rw') {
    return `ISHYA: ${input.customerName}, uributswa ${input.serviceName} kuri ${input.businessName} ku wa ${dateTime}.`;
  }
  if (input.language === 'fr') {
    return `ISHYA: rappel ${input.customerName}, ${input.serviceName} chez ${input.businessName} le ${dateTime}.`;
  }
  return `ISHYA: reminder for ${input.customerName}: ${input.serviceName} at ${input.businessName} on ${dateTime}.`;
}

/**
 * IntouchSMS HTTP API: HTTPS POST with HTTP Basic authentication and
 * application/x-www-form-urlencoded fields. A provider-accepted message is
 * recorded as sent; the returned provider ID can be queried for delivery status.
 */
export async function sendIntouchAppointmentSms(
  to: string,
  input: AppointmentSmsInput,
  config: IntouchSmsConfig,
  fetchImpl: typeof fetch = fetch
): Promise<{ messageId: string; providerStatus: string }> {
  const username = config.username?.trim();
  const password = config.password;
  const senderId = config.senderId?.trim();
  if (!username || !password || !senderId) {
    throw new Error('IntouchSMS delivery is not configured.');
  }
  if (!/^[A-Za-z0-9]{1,11}$/.test(senderId)) {
    throw new Error('IntouchSMS sender ID must be 1 to 11 alphanumeric characters.');
  }
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    throw new Error('Invalid IntouchSMS recipient number.');
  }

  const body = new URLSearchParams({
    recipients: to,
    message: buildIntouchAppointmentSmsMessage(input),
    sender: senderId,
  });
  const credentials = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  const response = await fetchImpl('https://www.intouchsms.co.rw/api/sendsms/.json', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  const result = await response.json().catch(() => ({})) as {
    success?: boolean;
    details?: Array<{ status?: string; messageid?: string | number; message?: string }>;
  };
  const detail = result.details?.[0];
  const providerStatus = String(detail?.status ?? '');
  const messageId = detail?.messageid === undefined ? '' : String(detail.messageid);
  if (!response.ok || result.success !== true || !messageId || !['P', 'Q', 'S', 'D'].includes(providerStatus)) {
    throw new Error(`IntouchSMS rejected the appointment reminder (HTTP ${response.status}).`);
  }
  return { messageId, providerStatus };
}
