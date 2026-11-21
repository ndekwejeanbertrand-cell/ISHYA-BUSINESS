import crypto from 'node:crypto';
import type { Express } from 'express';
import { recoverExpiredAppointmentReminderClaims } from './appointmentReminderQueue.ts';

/** Compare scheduler credentials without leaking timing information. */
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

/**
 * Protected scheduler endpoint. It deliberately does not claim or deliver jobs:
 * provider adapters and appointment-status revalidation must be implemented first.
 */
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

    // Do not acquire leases until a real delivery adapter is configured.
    // This prevents jobs being stranded in "processing" while delivery is unavailable.
    const deliveryConfigured = false;
    if (!deliveryConfigured) {
      res.status(503).json({
        status: 'paused',
        deliveryConfigured: false,
        message: 'No reminder delivery adapter is enabled; no jobs were claimed or sent.',
      });
      return;
    }

    try {
      const recoveredExpiredLeases = await recoverExpiredAppointmentReminderClaims(Date.now(), 50);
      res.json({ status: 'ok', recoveredExpiredLeases });
    } catch (error) {
      console.error('Appointment reminder worker:', error);
      res.status(502).json({ error: 'Reminder worker is temporarily unavailable.' });
    }
  });
}
