import crypto from 'node:crypto';
import type { Express } from 'express';
import {
  claimDueAppointmentReminderJobs,
  createInAppAppointmentNotification,
  finalizeAppointmentReminderClaim,
  getCurrentReminderAppointment,
  getReminderRetryDelayMs,
  recoverExpiredAppointmentReminderClaims,
  releaseAppointmentReminderClaim,
} from './appointmentReminderQueue.ts';
import { isReminderAppointmentCurrent, sendMetaWhatsAppAppointmentTemplate } from './appointmentReminderDelivery.ts';

export function isValidReminderWorkerAuthorization(
  authorizationHeader: string | undefined,
  configuredSecret: string | undefined
): boolean {
  if (!configuredSecret || configuredSecret.length < 32 || !authorizationHeader) return false;
  const prefix = 'Bearer ';
  if (!authorizationHeader.startsWith(prefix)) return false;
  const supplied = Buffer.from(authorizationHeader.slice(prefix.length), 'utf8');
  const expected = Buffer.from(configuredSecret, 'utf8');
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export interface ReminderWorkerSummary {
  recovered: number;
  claimed: number;
  sent: number;
  cancelled: number;
  retried: number;
  failed: number;
}

/** Processes only WhatsApp jobs; unsupported channels remain pending and untouched. */
export async function processDueWhatsAppAppointmentReminders(
  now = Date.now(),
  limit = 20,
  fetchImpl: typeof fetch = fetch
): Promise<ReminderWorkerSummary> {
  const recovered = await recoverExpiredAppointmentReminderClaims(now, 50);
  const jobs = await claimDueAppointmentReminderJobs(now, { limit, channel: 'whatsapp' });
  const summary: ReminderWorkerSummary = {
    recovered, claimed: jobs.length, sent: 0, cancelled: 0, retried: 0, failed: 0,
  };

  for (const job of jobs) {
    try {
      const current = await getCurrentReminderAppointment(String(job.record.appointmentId ?? ''));
      if (!isReminderAppointmentCurrent(job.record, current)) {
        if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'cancelled', {
          errorMessage: 'Appointment is no longer confirmed at the originally scheduled time.',
        })) summary.cancelled += 1;
        continue;
      }

      const to = String(job.record.customerPhone ?? current?.customerPhone ?? '');
      const customerName = String(current?.customerName ?? job.record.customerName ?? '');
      const serviceName = String(current?.serviceName ?? job.record.serviceName ?? '');
      const businessName = String(current?.businessName ?? job.record.businessName ?? '');
      const timeZone = String(current?.timeZone ?? job.record.timeZone ?? '');
      const language = current?.language ?? (job.record.language === 'rw' || job.record.language === 'fr' ? job.record.language : 'en');

      const sent = await sendMetaWhatsAppAppointmentTemplate(to, {
        customerName, serviceName, businessName,
        startAt: current!.startAt, timeZone, language,
      }, {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION,
        templateName: process.env.WHATSAPP_REMINDER_TEMPLATE_NAME,
        templateLanguage: process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || 'en',
      }, fetchImpl);

      if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'sent', { messageId: sent.messageId ?? undefined })) {
        summary.sent += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown reminder delivery error.';
      if (job.attemptCount >= 5) {
        if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'failed', { errorMessage: message })) summary.failed += 1;
      } else {
        const nextAttemptAt = new Date(now + getReminderRetryDelayMs(job.attemptCount)).toISOString();
        if (await releaseAppointmentReminderClaim(job.id, job.leaseToken, nextAttemptAt, message)) summary.retried += 1;
      }
    }
  }
  return summary;
}


export async function processDueInAppAppointmentReminders(
  now = Date.now(),
  limit = 20
): Promise<{ recovered: number; claimed: number; created: number; cancelled: number; retried: number; failed: number }> {
  const recovered = await recoverExpiredAppointmentReminderClaims(now, 50);
  const jobs = await claimDueAppointmentReminderJobs(now, { limit, channel: 'app' });
  const summary = { recovered, claimed: jobs.length, created: 0, cancelled: 0, retried: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const current = await getCurrentReminderAppointment(String(job.record.appointmentId ?? ''));
      if (!isReminderAppointmentCurrent(job.record, current)) {
        if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'cancelled', {
          errorMessage: 'Appointment is no longer confirmed at the originally scheduled time.',
        })) summary.cancelled += 1;
        continue;
      }
      const language = current?.language ?? (job.record.language === 'rw' || job.record.language === 'fr' ? job.record.language : 'en');
      await createInAppAppointmentNotification(job.id, {
        userUid: String(job.record.customerUid ?? ''),
        appointmentId: String(job.record.appointmentId ?? ''),
        businessId: String(job.record.businessId ?? ''),
        language,
        serviceName: String(current?.serviceName ?? job.record.serviceName ?? ''),
        businessName: String(current?.businessName ?? job.record.businessName ?? ''),
        startAt: current!.startAt,
        timeZone: String(current?.timeZone ?? job.record.timeZone ?? 'Africa/Kigali'),
        offset: String(job.record.offset ?? ''),
      });
      if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'sent')) summary.created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown in-app notification error.';
      if (job.attemptCount >= 5) {
        if (await finalizeAppointmentReminderClaim(job.id, job.leaseToken, 'failed', { errorMessage: message })) summary.failed += 1;
      } else {
        const nextAttemptAt = new Date(now + getReminderRetryDelayMs(job.attemptCount)).toISOString();
        if (await releaseAppointmentReminderClaim(job.id, job.leaseToken, nextAttemptAt, message)) summary.retried += 1;
      }
    }
  }
  return summary;
}

export function registerAppointmentReminderWorkerRoutes(app: Express): void {
  app.post('/api/internal/appointment-reminders/worker', async (req, res) => {
    const secret = process.env.APPOINTMENT_REMINDER_CRON_SECRET;
    if (!secret || secret.length < 32) {
      res.status(503).json({ error: 'Reminder worker is not configured.' });
      return;
    }
    if (!isValidReminderWorkerAuthorization(req.headers.authorization, secret)) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) {
      res.status(503).json({ status: 'paused', deliveryConfigured: false, message: 'Firebase service-account credentials are missing; no jobs were processed.' });
      return;
    }

    try {
      const requestedLimit = Number(req.body?.limit ?? 20);
      const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, Math.floor(requestedLimit))) : 20;
      const appSummary = await processDueInAppAppointmentReminders(Date.now(), limit);
      const whatsappConfigured = [
        process.env.WHATSAPP_ACCESS_TOKEN,
        process.env.WHATSAPP_PHONE_NUMBER_ID,
        process.env.WHATSAPP_GRAPH_API_VERSION,
        process.env.WHATSAPP_REMINDER_TEMPLATE_NAME,
      ].every((value) => Boolean(value?.trim()));
      const whatsappSummary = whatsappConfigured
        ? await processDueWhatsAppAppointmentReminders(Date.now(), limit)
        : null;
      res.json({
        status: whatsappConfigured ? 'ok' : 'partial',
        deliveryConfigured: true,
        channels: {
          app: { enabled: true, summary: appSummary },
          whatsapp: { enabled: whatsappConfigured, summary: whatsappSummary },
          sms: { enabled: false, reason: 'SMS provider has not been configured.' },
        },
      });
    } catch (error) {
      console.error('Appointment reminder worker:', error);
      res.status(502).json({ error: 'Reminder worker is temporarily unavailable.' });
    }
  });
}
