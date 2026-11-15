import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { WhatsAppStatusResponse } from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ROUTES_FILE = path.join(DATA_DIR, 'whatsapp-routes.json');

export interface WhatsAppRouteRecord {
  phoneNumberId: string;
  businessId: string;
  ownerId: string;
  displayPhoneNumber: string;
  webhookEnabled: boolean;
  updatedAt: string;
}

export interface IncomingWhatsAppMessage {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
}

let routeLock: Promise<void> = Promise.resolve();

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = routeLock.then(fn, fn);
  routeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function readRoutes(): Promise<WhatsAppRouteRecord[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(ROUTES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRoutesAtomic(routes: WhatsAppRouteRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpPath = `${ROUTES_FILE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(routes, null, 2), 'utf8');
  await fs.rename(tmpPath, ROUTES_FILE);
}

export function getWhatsAppStatus(): WhatsAppStatusResponse {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const verify = process.env.WHATSAPP_VERIFY_TOKEN;
  const secret = process.env.WHATSAPP_APP_SECRET;
  return {
    cloudApiConfigured: Boolean(token && token !== 'MY_WHATSAPP_ACCESS_TOKEN'),
    verifyTokenConfigured: Boolean(verify && verify !== 'MY_WHATSAPP_VERIFY_TOKEN'),
    appSecretConfigured: Boolean(secret && secret !== 'MY_WHATSAPP_APP_SECRET'),
    webhookPath: '/api/whatsapp/webhook',
  };
}

export async function registerWhatsAppRoute(params: {
  phoneNumberId: string;
  businessId: string;
  ownerId: string;
  displayPhoneNumber: string;
  webhookEnabled: boolean;
}): Promise<WhatsAppRouteRecord> {
  return runSerialized(async () => {
    const routes = await readRoutes();
    const cleanPhoneId = params.phoneNumberId.trim();

    if (cleanPhoneId) {
      const conflicting = routes.find(
        (r) => r.phoneNumberId === cleanPhoneId && r.businessId !== params.businessId
      );
      if (conflicting) {
        throw new Error('This Meta Phone Number ID is already linked to another business.');
      }
    }

    const filtered = routes.filter((r) => r.businessId !== params.businessId);
    const record: WhatsAppRouteRecord = {
      phoneNumberId: cleanPhoneId,
      businessId: params.businessId,
      ownerId: params.ownerId,
      displayPhoneNumber: params.displayPhoneNumber.trim(),
      webhookEnabled: Boolean(params.webhookEnabled && cleanPhoneId),
      updatedAt: new Date().toISOString(),
    };

    if (cleanPhoneId) {
      filtered.push(record);
    }
    await writeRoutesAtomic(filtered);
    return record;
  });
}

export async function findBusinessIdByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppRouteRecord | null> {
  const routes = await readRoutes();
  return (
    routes.find(
      (r) => r.phoneNumberId === phoneNumberId && r.webhookEnabled
    ) ?? null
  );
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const providedHex = signatureHeader.slice('sha256='.length);
  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(providedHex, 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function extractIncomingWhatsAppMessages(payload: unknown): IncomingWhatsAppMessage[] {
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  const results: IncomingWhatsAppMessage[] = [];
  for (const entry of root?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const msg of value?.messages ?? []) {
        if (msg?.type === 'text' && msg.text?.body && msg.from) {
          results.push({
            phoneNumberId,
            from: msg.from,
            messageId: msg.id ?? '',
            text: msg.text.body.trim(),
          });
        }
      }
    }
  }
  return results;
}

export async function sendMetaWhatsAppReply(params: {
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<{ sent: boolean; status?: number; reason?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || token === 'MY_WHATSAPP_ACCESS_TOKEN') {
    return {
      sent: false,
      reason: 'WHATSAPP_ACCESS_TOKEN is not configured on the server.',
    };
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(
    params.phoneNumberId
  )}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.to,
      type: 'text',
      text: {
        preview_url: false,
        body: params.text.slice(0, 4096),
      },
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      status: response.status,
      reason: `Meta Graph API responded with HTTP ${response.status}.`,
    };
  }

  return { sent: true, status: response.status };
}
