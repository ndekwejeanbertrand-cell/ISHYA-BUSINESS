import type { Language } from '../src/types.ts';

export interface AppointmentReminderTemplateInput {
  customerName: string;
  serviceName: string;
  businessName: string;
  startAt: string;
  timeZone: string;
  language: Language;
}

export interface MetaWhatsAppTemplateConfig {
  accessToken?: string;
  phoneNumberId?: string;
  graphApiVersion?: string;
  templateName?: string;
  templateLanguage?: string;
}

export function formatAppointmentReminderDateTime(
  startAt: string,
  timeZone: string,
  language: Language
): string {
  const date = new Date(startAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid appointment reminder date.');
  return new Intl.DateTimeFormat(
    language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short', timeZone }
  ).format(date);
}

/**
 * Template contract (approved in Meta WhatsApp Manager by the account owner):
 * {{1}} customer name, {{2}} business name, {{3}} service name,
 * {{4}} appointment date/time. Keep this ordering aligned with the approved template.
 */
export function buildAppointmentReminderTemplatePayload(
  to: string,
  input: AppointmentReminderTemplateInput,
  templateName: string,
  templateLanguage: string
) {
  const recipient = to.replace(/^\+/, '');
  if (!/^\d{8,15}$/.test(recipient)) throw new Error('Invalid WhatsApp recipient number.');
  if (!/^[a-z0-9_]{1,128}$/.test(templateName)) throw new Error('Invalid WhatsApp template name.');
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(templateLanguage)) throw new Error('Invalid WhatsApp template language.');
  const values = [
    input.customerName,
    input.businessName,
    input.serviceName,
    formatAppointmentReminderDateTime(input.startAt, input.timeZone, input.language),
  ];
  if (values.some((value) => !value || value.trim().length === 0 || value.length > 200)) {
    throw new Error('Appointment reminder template values are incomplete.');
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [{
        type: 'body',
        parameters: values.map((text) => ({ type: 'text', text })),
      }],
    },
  };
}

export function isReminderAppointmentCurrent(
  queued: { appointmentId?: unknown; appointmentStartAt?: unknown },
  current: { id?: unknown; status?: unknown; startAt?: unknown } | null
): boolean {
  return Boolean(
    current
    && current.id === queued.appointmentId
    && current.status === 'confirmed'
    && typeof queued.appointmentStartAt === 'string'
    && current.startAt === queued.appointmentStartAt
  );
}

export async function sendMetaWhatsAppAppointmentTemplate(
  to: string,
  input: AppointmentReminderTemplateInput,
  config: MetaWhatsAppTemplateConfig,
  fetchImpl: typeof fetch = fetch
): Promise<{ messageId: string | null }> {
  const accessToken = config.accessToken;
  const phoneNumberId = config.phoneNumberId;
  const graphApiVersion = config.graphApiVersion;
  const templateName = config.templateName;
  const templateLanguage = config.templateLanguage || 'en';
  if (!accessToken || !phoneNumberId || !graphApiVersion || !templateName) {
    throw new Error('WhatsApp reminder delivery is not configured.');
  }
  if (!/^v\d+\.\d+$/.test(graphApiVersion) || !/^\d{5,30}$/.test(phoneNumberId)) {
    throw new Error('WhatsApp Graph API configuration is invalid.');
  }

  const payload = buildAppointmentReminderTemplatePayload(to, input, templateName, templateLanguage);
  const response = await fetchImpl(
    `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
  const result = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number };
  };
  if (!response.ok || !result.messages?.[0]?.id) {
    const code = result.error?.code ? ` (Meta code ${result.error.code})` : '';
    throw new Error(`WhatsApp template delivery failed${code}.`);
  }
  return { messageId: result.messages[0].id };
}
