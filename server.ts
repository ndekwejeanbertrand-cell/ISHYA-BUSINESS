import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { generateBusinessReply } from './server/gemini.ts';
import { extractBearerToken, verifyFirebaseIdToken } from './server/auth.ts';
import {
  getFirestoreBusinessById,
  listPublishedFirestoreBusinesses,
} from './server/firestoreRest.ts';
import { SlidingWindowRateLimiter } from './server/rateLimit.ts';
import { registerAppointmentRoutes } from './server/appointmentApi.ts';
import { registerAppointmentReminderWorkerRoutes } from './server/appointmentReminderWorker.ts';
import {
  extractIncomingWhatsAppMessages,
  findBusinessIdByPhoneNumberId,
  getWhatsAppStatus,
  registerWhatsAppRoute,
  sendMetaWhatsAppReply,
  verifyMetaWebhookSignature,
} from './server/whatsapp.ts';
import {
  getRegionsForCountry,
  searchCitiesForCountry,
  searchCountries,
} from './server/locations.ts';
import type { BusinessProfile, ChatTurn, Language } from './src/types.ts';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

const chatLimiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
});

function getClientKey(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

async function resolveBusinessForChat(
  businessId: string,
  bearerToken?: string | null
): Promise<BusinessProfile | null> {
  return getFirestoreBusinessById(businessId, bearerToken ?? undefined);
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Capture raw body for Meta X-Hub-Signature-256 HMAC verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

  // Security headers compatible with iframe preview hosting
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ISHYA Business',
      whatsapp: getWhatsAppStatus(),
    });
  });

  // Worldwide location directory endpoints (countries, regions/states, cities)
  app.get('/api/locations/countries', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ countries: searchCountries(q) });
  });

  app.get('/api/locations/regions', (req, res) => {
    const country = typeof req.query.country === 'string' ? req.query.country : '';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ regions: getRegionsForCountry(country, q) });
  });

  app.get('/api/locations/cities', (req, res) => {
    const country = typeof req.query.country === 'string' ? req.query.country : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const region = typeof req.query.region === 'string' ? req.query.region : '';
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    res.json(
      searchCitiesForCountry({
        countryCode: country,
        stateCode: state,
        regionName: region,
        query: q,
        limit,
      })
    );
  });

  // Public customer-facing directory: published Firestore storefronts only
  app.get('/api/public-businesses', async (_req, res) => {
    try {
      const published = await listPublishedFirestoreBusinesses();
      res.json({ businesses: published });
    } catch (error) {
      console.error('Failed to load public businesses:', error);
      res.json({ businesses: [] });
    }
  });

  // Appointment booking, customer listing and business-owner approval routes
  registerAppointmentRoutes(app);
  registerAppointmentReminderWorkerRoutes(app);

  // Grounded multilingual AI customer chat (strictly scoped to one businessId)
  app.post('/api/chat', async (req, res) => {
    const rate = chatLimiter.check(`chat:${getClientKey(req)}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }

    try {
      const { businessId, language, message, history } = req.body ?? {};
      if (typeof businessId !== 'string' || !businessId.trim()) {
        res.status(400).json({ error: 'A valid businessId is required.' });
        return;
      }
      if (typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      const bearerToken = extractBearerToken(req.headers.authorization);
      const business = await resolveBusinessForChat(businessId.trim(), bearerToken);
      if (!business) {
        res.status(404).json({ error: 'Business not found or not published.' });
        return;
      }

      const lang: Language =
        language === 'rw' || language === 'en' || language === 'fr' ? language : 'en';

      const sanitizedHistory: ChatTurn[] = Array.isArray(history)
        ? history
            .filter(
              (item): item is ChatTurn =>
                Boolean(item) &&
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.text === 'string' &&
                item.text.trim().length > 0
            )
            .slice(-10)
        : [];

      const result = await generateBusinessReply({
        business,
        language: lang,
        message: message.trim().slice(0, 1200),
        history: sanitizedHistory,
      });

      res.json(result);
    } catch (error) {
      console.error('Chat endpoint error:', error);
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('GEMINI_API_KEY')) {
        res.status(502).json({
          error: 'AI service configuration is missing on the server.',
        });
        return;
      }
      res.status(502).json({
        error: 'The AI assistant could not process your request right now.',
      });
    }
  });

  // Phase 4: WhatsApp Cloud API integration status (booleans only, never secrets)
  app.get('/api/whatsapp/status', (_req, res) => {
    res.json(getWhatsAppStatus());
  });

  // Phase 4: Authenticated owner registers Meta phoneNumberId -> businessId routing
  app.post('/api/whatsapp/register-route', async (req, res) => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(token);
      if (!user.emailVerified) {
        res.status(403).json({ error: 'Verified email account is required.' });
        return;
      }

      const { businessId, phoneNumberId, displayPhoneNumber, webhookEnabled } = req.body ?? {};
      if (typeof businessId !== 'string' || !businessId.trim()) {
        res.status(400).json({ error: 'businessId is required.' });
        return;
      }

      const business = await getFirestoreBusinessById(businessId.trim(), token);
      if (!business || business.ownerId !== user.uid) {
        res.status(403).json({ error: 'You do not own this business.' });
        return;
      }

      const route = await registerWhatsAppRoute({
        businessId: business.id,
        ownerId: user.uid,
        phoneNumberId: String(phoneNumberId ?? ''),
        displayPhoneNumber: String(displayPhoneNumber ?? business.whatsappNumber ?? ''),
        webhookEnabled: Boolean(webhookEnabled),
      });

      res.json({ route });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to register WhatsApp route.';
      res.status(400).json({ error: msg });
    }
  });

  // Phase 4: Authenticated owner Dry-Run simulator for WhatsApp webhook pipeline
  app.post('/api/whatsapp/simulate', async (req, res) => {
    const rate = chatLimiter.check(`sim:${getClientKey(req)}`);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds));
      res.status(429).json({ error: 'Too many simulation requests.' });
      return;
    }

    try {
      const token = extractBearerToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const user = await verifyFirebaseIdToken(token);
      const { businessId, phoneNumberId, customerMessage, language } = req.body ?? {};
      if (typeof businessId !== 'string' || !businessId.trim()) {
        res.status(400).json({ error: 'businessId is required.' });
        return;
      }
      if (typeof customerMessage !== 'string' || !customerMessage.trim()) {
        res.status(400).json({ error: 'customerMessage is required.' });
        return;
      }

      const business = await getFirestoreBusinessById(businessId.trim(), token);
      if (!business || business.ownerId !== user.uid) {
        res.status(403).json({ error: 'You do not own this business.' });
        return;
      }

      const mockPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            changes: [
              {
                field: 'messages',
                value: {
                  metadata: {
                    phone_number_id: String(phoneNumberId || 'DRY_RUN_PHONE_NUMBER_ID'),
                  },
                  messages: [
                    {
                      id: `wamid.dryrun.${Date.now()}`,
                      from: 'dry-run-customer',
                      type: 'text',
                      text: { body: customerMessage.trim().slice(0, 1000) },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const parsed = extractIncomingWhatsAppMessages(mockPayload);
      const lang: Language =
        language === 'rw' || language === 'en' || language === 'fr' ? language : 'en';

      const aiResult = await generateBusinessReply({
        business,
        language: lang,
        message: parsed[0].text,
        history: [],
      });

      res.json({
        dryRun: true,
        cloudApiConfigured: getWhatsAppStatus().cloudApiConfigured,
        parsedWebhookMessage: parsed[0],
        aiReply: aiResult,
        outboundGraphPayload: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: parsed[0].from,
          type: 'text',
          text: { body: aiResult.reply },
        },
      });
    } catch (error) {
      console.error('WhatsApp simulation error:', error);
      res.status(502).json({ error: 'Could not run WhatsApp dry-run simulation.' });
    }
  });

  // Phase 4: Meta WhatsApp Cloud API webhook verification challenge
  app.get('/api/whatsapp/webhook', (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken || verifyToken === 'MY_WHATSAPP_VERIFY_TOKEN') {
      res.status(503).send('WhatsApp verify token not configured.');
      return;
    }
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken && typeof challenge === 'string') {
      res.status(200).send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  // Phase 4: Meta WhatsApp Cloud API incoming message webhook
  app.post('/api/whatsapp/webhook', async (req, res) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret && appSecret !== 'MY_WHATSAPP_APP_SECRET') {
      const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
      const sig = req.headers['x-hub-signature-256'];
      const sigHeader = Array.isArray(sig) ? sig[0] : sig;
      if (!rawBody || !verifyMetaWebhookSignature(rawBody, sigHeader, appSecret)) {
        res.sendStatus(403);
        return;
      }
    }

    const incoming = extractIncomingWhatsAppMessages(req.body);
    if (incoming.length === 0) {
      res.status(200).json({ processed: 0 });
      return;
    }

    const results: Array<{ messageId: string; handled: boolean; sent: boolean; reason?: string }> = [];
    for (const msg of incoming) {
      const route = await findBusinessIdByPhoneNumberId(msg.phoneNumberId);
      if (!route) {
        results.push({
          messageId: msg.messageId,
          handled: false,
          sent: false,
          reason: 'No active business route for this phone_number_id.',
        });
        continue;
      }

      const business = await getFirestoreBusinessById(route.businessId);
      if (!business) {
        results.push({
          messageId: msg.messageId,
          handled: false,
          sent: false,
          reason: 'Target business is not publicly readable or does not exist.',
        });
        continue;
      }

      const aiResult = await generateBusinessReply({
        business,
        language: 'rw',
        message: msg.text,
        history: [],
      });

      const outbound = await sendMetaWhatsAppReply({
        phoneNumberId: msg.phoneNumberId,
        to: msg.from,
        text: aiResult.reply,
      });

      results.push({
        messageId: msg.messageId,
        handled: true,
        sent: outbound.sent,
        reason: outbound.reason,
      });
    }

    res.status(200).json({ processed: results.length, results });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ISHYA Business server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ISHYA Business server:', err);
  process.exit(1);
});
