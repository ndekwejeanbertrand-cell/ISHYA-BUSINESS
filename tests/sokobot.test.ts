import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildSystemInstruction } from '../server/gemini.ts';
import { SlidingWindowRateLimiter } from '../server/rateLimit.ts';
import {
  extractIncomingWhatsAppMessages,
  verifyMetaWebhookSignature,
} from '../server/whatsapp.ts';
import { formatUserFriendlyError } from '../src/utils/errorFormat.ts';
import {
  BUSINESS_CATEGORIES,
  getCategoryLabel,
  isStandardCategory,
} from '../src/constants/categories.ts';
import {
  getSectorsForDistrict,
  isValidRwandaDistrict,
  isValidRwandaSector,
  RWANDA_DISTRICTS,
  RWANDA_SECTORS_BY_DISTRICT,
} from '../src/constants/rwandaDivisions.ts';
import {
  isOfflineOrUnavailableError,
  toFirestoreRestValue,
} from '../src/services/firestoreRestClient.ts';
import {
  getAllCountries,
  getCountryByCode,
  getCountryNameForLanguage,
  getRegionsForCountry,
  searchCitiesForCountry,
  searchCountries,
} from '../server/locations.ts';
import type { BusinessProfile } from '../src/types.ts';
import { isValidReminderWorkerAuthorization, processDueWhatsAppAppointmentReminders, processDueInAppAppointmentReminders, processDueIntouchSmsAppointmentReminders } from '../server/appointmentReminderWorker.ts';
import { buildAppointmentReminderTemplatePayload, isReminderAppointmentCurrent } from '../server/appointmentReminderDelivery.ts';
import { buildIntouchAppointmentSmsMessage, sendIntouchAppointmentSms } from '../server/appointmentSmsDelivery.ts';

function makeTestBusiness(overrides: Partial<BusinessProfile>): BusinessProfile {
  return {
    id: 'test-biz',
    slug: 'test-biz',
    name: 'Test Business',
    category: 'General',
    isDemo: false,
    description: '',
    address: '',
    district: '',
    city: '',
    phone: '',
    whatsappNumber: '',
    email: '',
    humanHandoffNote: '',
    hours: [
      { day: 'monday', open: '09:00', close: '17:00', closed: false },
    ],
    services: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ISHYA Business — Multi-Tenant Isolation & Grounding', () => {
  it('includes only the target business data in Gemini system prompt', () => {
    const bizA = makeTestBusiness({
      id: 'tenant-a',
      name: 'Tenant Workspace Alpha',
      whatsappNumber: 'TENANT_ALPHA_WA',
      services: [
        {
          id: 'srv-a',
          name: 'Alpha Consultation',
          priceRwf: 10000,
          durationOrUnit: '60 mins',
          description: 'Alpha-only service',
        },
      ],
    });
    const bizB = makeTestBusiness({
      id: 'tenant-b',
      name: 'Tenant Workspace Beta',
      whatsappNumber: 'TENANT_BETA_WA',
      services: [
        {
          id: 'srv-b',
          name: 'Beta Package',
          priceRwf: 20000,
          durationOrUnit: 'Unit',
          description: 'Beta-only service',
        },
      ],
    });

    const promptA = buildSystemInstruction(bizA, 'rw');
    assert.ok(promptA.includes(bizA.name));
    assert.ok(promptA.includes('Alpha Consultation'));
    assert.ok(!promptA.includes(bizB.name));
    assert.ok(!promptA.includes('Beta Package'));
    assert.ok(!promptA.includes(bizB.whatsappNumber));
  });
});

describe('ISHYA Business — Rate Limiter', () => {
  it('blocks requests exceeding the window threshold and recovers after window expiry', () => {
    const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxRequests: 2 });
    const start = 1_000_000;

    assert.equal(limiter.check('ip-1', start).allowed, true);
    assert.equal(limiter.check('ip-1', start + 100).allowed, true);
    const blocked = limiter.check('ip-1', start + 200);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);

    // Different IP stays unaffected
    assert.equal(limiter.check('ip-2', start + 200).allowed, true);

    // Window expires
    assert.equal(limiter.check('ip-1', start + 1200).allowed, true);
  });
});

describe('ISHYA Business — Meta WhatsApp Cloud API Verification & Parsing', () => {
  it('validates X-Hub-Signature-256 HMAC-SHA256 signatures accurately', () => {
    const secret = 'test-meta-app-secret';
    const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }), 'utf8');
    const validSig =
      'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

    assert.equal(verifyMetaWebhookSignature(body, validSig, secret), true);
    assert.equal(verifyMetaWebhookSignature(body, 'sha256=deadbeef', secret), false);
    assert.equal(verifyMetaWebhookSignature(body, undefined, secret), false);
    assert.equal(
      verifyMetaWebhookSignature(Buffer.from('tampered'), validSig, secret),
      false
    );
  });

  it('extracts text messages and phone_number_id from Meta webhook payload', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'TEST_PHONE_ID' },
                messages: [
                  {
                    id: 'wamid.test1',
                    from: 'TEST_SENDER_ID',
                    type: 'text',
                    text: { body: 'Muraho, mufungura ryari?' },
                  },
                  {
                    id: 'wamid.test2',
                    from: 'TEST_SENDER_ID',
                    type: 'image',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const messages = extractIncomingWhatsAppMessages(payload);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      phoneNumberId: 'TEST_PHONE_ID',
      from: 'TEST_SENDER_ID',
      messageId: 'wamid.test1',
      text: 'Muraho, mufungura ryari?',
    });
  });
});

describe('ISHYA Business — Graceful Firestore Permission Error Formatting', () => {
  it('converts raw FirestoreErrorInfo JSON for owners/{uid} into a readable message', () => {
    const rawJsonError = new Error(
      JSON.stringify({
        error: 'Missing or insufficient permissions.',
        operationType: 'write',
        path: 'owners/user123',
        authInfo: { userId: 'user123', emailVerified: true },
      })
    );

    const enMsg = formatUserFriendlyError(rawJsonError, 'en');
    assert.ok(!enMsg.includes('{'));
    assert.ok(!enMsg.toLowerCase().includes('firestore'));
    assert.ok(enMsg.toLowerCase().includes('owner account'));

    const rwMsg = formatUserFriendlyError(rawJsonError, 'rw');
    assert.ok(!rwMsg.includes('{'));
    assert.ok(!rwMsg.toLowerCase().includes('firestore'));
    assert.ok(rwMsg.includes('konti'));

    const frMsg = formatUserFriendlyError(rawJsonError, 'fr');
    assert.ok(!frMsg.includes('{'));
    assert.ok(!frMsg.toLowerCase().includes('firestore'));
    assert.ok(frMsg.toLowerCase().includes('propriétaire'));
  });

  it('converts business permission-denied and auth popup errors cleanly', () => {
    const bizErr = new Error(
      JSON.stringify({
        error: 'Missing or insufficient permissions.',
        operationType: 'update',
        path: 'businesses/biz_123',
      })
    );
    const bizMsg = formatUserFriendlyError(bizErr, 'en');
    assert.ok(bizMsg.toLowerCase().includes('business workspace'));

    const popupErr = new Error('Firebase: Error (auth/popup-blocked).');
    const popupMsg = formatUserFriendlyError(popupErr, 'en');
    assert.ok(popupMsg.toLowerCase().includes('popup'));
  });
});

describe('ISHYA Business — Searchable Business Categories', () => {
  it('provides all 16 required categories in exact order with RW/EN/FR labels', () => {
    const expected = [
      'Restaurant & Café',
      'Hotel & Guest House',
      'Salon & Beauty',
      'Barber Shop',
      'Boutique & Fashion',
      'Supermarket & Grocery',
      'Electronics & Technology',
      'Garage & Automotive',
      'Car Rental & Transport',
      'Real Estate',
      'Travel & Tourism',
      'Pharmacy & Healthcare',
      'Education & Training',
      'Construction & Hardware',
      'Professional Services',
      'Other',
    ];

    assert.deepEqual(
      BUSINESS_CATEGORIES.map((c) => c.value),
      expected
    );

    for (const cat of BUSINESS_CATEGORIES) {
      assert.ok(cat.value.length <= 80);
      assert.ok(cat.labels.en.length > 0);
      assert.ok(cat.labels.rw.length > 0);
      assert.ok(cat.labels.fr.length > 0);
    }
  });

  it('localizes standard categories and preserves custom Other category values', () => {
    assert.equal(isStandardCategory('Salon & Beauty'), true);
    assert.equal(isStandardCategory('Other'), false);
    assert.equal(isStandardCategory('Bakery & Pastry'), false);

    assert.equal(getCategoryLabel('Salon & Beauty', 'rw'), 'Salo y’Ubwiza');
    assert.equal(getCategoryLabel('Salon & Beauty', 'fr'), 'Salon & Beauté');
    assert.equal(getCategoryLabel('Bakery & Pastry', 'rw'), 'Bakery & Pastry');
  });
});

describe('ISHYA Business — Rwanda 30 Districts & 416 Sectors', () => {
  it('contains exactly 30 unique districts and 416 sectors with no duplicates', () => {
    assert.equal(RWANDA_DISTRICTS.length, 30);
    assert.equal(new Set(RWANDA_DISTRICTS).size, 30);

    let totalSectors = 0;
    for (const district of RWANDA_DISTRICTS) {
      const sectors = RWANDA_SECTORS_BY_DISTRICT[district];
      assert.ok(sectors.length > 0, `${district} must have sectors`);
      assert.equal(
        new Set(sectors).size,
        sectors.length,
        `${district} must not have duplicate sectors`
      );
      totalSectors += sectors.length;
    }

    assert.equal(totalSectors, 416);
  });

  it('validates district-sector relationships and rejects cross-district mismatches', () => {
    assert.equal(isValidRwandaDistrict('Gasabo'), true);
    assert.equal(isValidRwandaDistrict('Kicukiro'), true);
    assert.equal(isValidRwandaDistrict('InvalidDistrict'), false);

    assert.deepEqual(getSectorsForDistrict('InvalidDistrict'), []);
    assert.equal(isValidRwandaSector('Gasabo', 'Kimihurura'), true);
    assert.equal(isValidRwandaSector('Kicukiro', 'Niboye'), true);
    assert.equal(isValidRwandaSector('Nyarugenge', 'Nyarugenge'), true);
    assert.equal(isValidRwandaSector('Ngororero', 'Bwira'), true);
    assert.equal(isValidRwandaSector('Nyagatare', 'Gatunda'), true);
    assert.equal(isValidRwandaSector('Rulindo', 'Base'), true);

    // Changing district from Gasabo to Kicukiro invalidates Gasabo's sector
    assert.equal(isValidRwandaSector('Kicukiro', 'Kimihurura'), false);
  });
});

describe('ISHYA Business — Firestore Offline Detection & REST Encoding', () => {
  it('detects client-offline and unavailable errors accurately', () => {
    assert.equal(
      isOfflineOrUnavailableError(
        new Error('Failed to get document because the client is offline.')
      ),
      true
    );
    const unavailableErr = Object.assign(new Error('Service unavailable'), {
      code: 'unavailable',
    });
    assert.equal(isOfflineOrUnavailableError(unavailableErr), true);
    assert.equal(
      isOfflineOrUnavailableError(new Error('Missing or insufficient permissions.')),
      false
    );
  });

  it('encodes business fields cleanly into Firestore REST value format', () => {
    const encoded = toFirestoreRestValue({
      name: 'Kigali Roasters',
      priceRwf: 3500,
      isPublished: true,
      services: [{ name: 'Espresso', priceRwf: 3500 }],
    });
    assert.deepEqual(encoded, {
      mapValue: {
        fields: {
          name: { stringValue: 'Kigali Roasters' },
          priceRwf: { integerValue: '3500' },
          isPublished: { booleanValue: true },
          services: {
            arrayValue: {
              values: [
                {
                  mapValue: {
                    fields: {
                      name: { stringValue: 'Espresso' },
                      priceRwf: { integerValue: '3500' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
  });
});

describe('ISHYA Business — Worldwide Countries, Regions & Dependent Cities', () => {
  it('supports all countries with flags, RW default first, and EN/FR/RW search', () => {
    const all = getAllCountries();
    assert.ok(all.length >= 240, 'Should include worldwide countries and territories');
    assert.equal(all[0].code, 'RW', 'Rwanda should be default/pinned first');
    assert.equal(all[0].flag, '🇷🇼');

    for (const code of ['RW', 'KE', 'UG', 'TZ', 'GB', 'US', 'FR']) {
      const c = getCountryByCode(code);
      assert.ok(c, `Expected country ${code}`);
      assert.ok(c.flag.length > 0, `Expected flag for ${code}`);
      assert.ok(getCountryNameForLanguage(c, 'en').length > 0);
      assert.ok(getCountryNameForLanguage(c, 'fr').length > 0);
      assert.ok(getCountryNameForLanguage(c, 'rw').length > 0);
    }

    assert.ok(
      searchCountries('Ubwongereza').some((c) => c.code === 'GB'),
      'Kinyarwanda search should find United Kingdom'
    );
    assert.ok(
      searchCountries('Etats-Unis').some((c) => c.code === 'US'),
      'Diacritic-insensitive French search should find United States'
    );
  });

  it('returns distinct regions and cities per country across RW, KE, UG, TZ, GB, US, and FR', () => {
    const expectations: Array<{ code: string; cityQuery: string; expectedCity: string }> = [
      { code: 'RW', cityQuery: 'Kigali', expectedCity: 'Kigali' },
      { code: 'KE', cityQuery: 'Nairobi', expectedCity: 'Nairobi' },
      { code: 'UG', cityQuery: 'Kampala', expectedCity: 'Kampala' },
      { code: 'TZ', cityQuery: 'Dar es Salaam', expectedCity: 'Dar es Salaam' },
      { code: 'GB', cityQuery: 'London', expectedCity: 'London' },
      { code: 'US', cityQuery: 'Austin', expectedCity: 'Austin' },
      { code: 'FR', cityQuery: 'Paris', expectedCity: 'Paris' },
    ];

    for (const { code, cityQuery, expectedCity } of expectations) {
      const regions = getRegionsForCountry(code);
      assert.ok(regions.length > 0, `Expected administrative regions for ${code}`);

      const res = searchCitiesForCountry({ countryCode: code, query: cityQuery });
      assert.ok(
        res.cities.some((c) => c.name.toLowerCase() === expectedCity.toLowerCase()),
        `Expected ${expectedCity} in ${code} city results`
      );
    }

    // Verify city results change strictly when switching country
    const keParis = searchCitiesForCountry({ countryCode: 'KE', query: 'Paris' });
    assert.equal(
      keParis.cities.some((c) => c.name.toLowerCase() === 'paris'),
      false,
      'Paris should not appear when Kenya is selected'
    );

    const frNairobi = searchCitiesForCountry({ countryCode: 'FR', query: 'Nairobi' });
    assert.equal(
      frNairobi.cities.some((c) => c.name.toLowerCase() === 'nairobi'),
      false,
      'Nairobi should not appear when France is selected'
    );

    // Filtering US cities by region narrows accurately
    const txCities = searchCitiesForCountry({
      countryCode: 'US',
      regionName: 'Texas',
      query: 'Austin',
    });
    assert.ok(txCities.cities.some((c) => c.name === 'Austin'));
  });
});


import {
  AppointmentValidationError,
  buildAppointmentReminderJobs,
  parseServiceDurationMinutes,
  validateAppointmentRequest,
} from '../server/appointments.ts';

describe('ISHYA Business — Appointment domain and reminders', () => {
  const request = {
    businessId: 'biz_123',
    serviceId: 'service_1',
    customerUid: 'customer_1',
    customerName: 'Aline Customer',
    customerPhone: '+250788123456',
    startAt: '2027-01-15T10:00:00.000Z',
    endAt: '2027-01-15T11:00:00.000Z',
    timeZone: 'Africa/Kigali',
    language: 'rw',
    requestedBy: 'customer',
    notificationChannels: ['whatsapp', 'app'],
  };

  it('parses explicit service durations and refuses ambiguous units', () => {
    assert.equal(parseServiceDurationMinutes('45 mins'), 45);
    assert.equal(parseServiceDurationMinutes('1 hour'), 60);
    assert.equal(parseServiceDurationMinutes('2 hrs'), 120);
    assert.equal(parseServiceDurationMinutes('Unit'), null);
    assert.equal(parseServiceDurationMinutes(''), null);
  });

  it('validates future appointment requests and normalizes timestamps', () => {
    const result = validateAppointmentRequest(request, Date.parse('2027-01-01T00:00:00Z'));
    assert.equal(result.startAt, '2027-01-15T10:00:00.000Z');
    assert.deepEqual(result.notificationChannels, ['whatsapp', 'app']);
  });

  it('rejects invalid phone numbers, unsupported time zones, and past appointments', () => {
    assert.throws(
      () => validateAppointmentRequest({ ...request, customerPhone: '0788123456' }, 0),
      AppointmentValidationError
    );
    assert.throws(
      () => validateAppointmentRequest({ ...request, timeZone: 'Mars/Phobos' }, 0),
      AppointmentValidationError
    );
    assert.throws(
      () => validateAppointmentRequest(request, Date.parse('2027-02-01T00:00:00Z')),
      AppointmentValidationError
    );
  });

  it('creates reminders only for confirmed appointments and only for future deadlines', () => {
    const base = {
      id: 'appt_1',
      businessId: 'biz_123',
      customerUid: 'customer_1',
      startAt: '2027-01-15T10:00:00.000Z',
      notificationChannels: ['whatsapp', 'app'] as const,
    };
    assert.deepEqual(buildAppointmentReminderJobs({ ...base, status: 'pending' }, 0), []);
    const jobs = buildAppointmentReminderJobs({ ...base, status: 'confirmed' }, Date.parse('2027-01-14T09:30:00Z'));
    assert.deepEqual(jobs.map((job) => job.offset), ['24h', '1h', '30m']);
    assert.deepEqual(jobs[0].channels, ['whatsapp', 'app']);
    const lateJobs = buildAppointmentReminderJobs({ ...base, status: 'confirmed' }, Date.parse('2027-01-15T09:15:00Z'));
    assert.deepEqual(lateJobs.map((job) => job.offset), ['30m']);
  });
});


import { getGoogleServiceAccountAccessToken, resetGoogleServiceAccountTokenCache } from '../server/googleServiceAccount.ts';

describe('ISHYA server credentials', () => {
  it('fails closed when the server-only Firebase service account secret is absent', async () => {
    const original = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    resetGoogleServiceAccountTokenCache();
    try {
      await assert.rejects(
        () => getGoogleServiceAccountAccessToken(),
        /FIREBASE_SERVICE_ACCOUNT_JSON is not configured/
      );
    } finally {
      if (original === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = original;
      resetGoogleServiceAccountTokenCache();
    }
  });
});


import { buildReminderQueueRecords, getReminderRetryDelayMs, releaseAppointmentReminderClaim } from '../server/appointmentReminderQueue.ts';

describe('ISHYA Business — durable reminder queue records', () => {
  const confirmed = {
    id: 'apt_queue_1',
    businessId: 'biz_123',
    customerUid: 'customer_1',
    customerPhone: '+250788123456',
    customerName: 'Aline Customer',
    customerEmail: 'aline@example.com',
    startAt: '2027-01-15T10:00:00.000Z',
    status: 'confirmed' as const,
    notificationChannels: ['whatsapp', 'app'] as const,
    language: 'rw' as const,
    timeZone: 'Africa/Kigali',
  };

  it('creates deterministic jobs for each future offset and selected channel', () => {
    const jobs = buildReminderQueueRecords(confirmed, Date.parse('2027-01-14T08:00:00.000Z'));
    assert.equal(jobs.length, 6);
    assert.deepEqual(jobs.map((job) => job.id), [
      'apt_queue_1_1800007200000_24h_whatsapp',
      'apt_queue_1_1800007200000_24h_app',
      'apt_queue_1_1800007200000_1h_whatsapp',
      'apt_queue_1_1800007200000_1h_app',
      'apt_queue_1_1800007200000_30m_whatsapp',
      'apt_queue_1_1800007200000_30m_app',
    ]);
    assert.ok(jobs.every((job) => job.status === 'pending' && job.attemptCount === 0));
    assert.ok(jobs.every((job) => job.customerPhone === confirmed.customerPhone));
  });

  it('creates a new deterministic reminder identity when an appointment is rescheduled', () => {
    const original = buildReminderQueueRecords(confirmed, Date.parse('2027-01-14T08:00:00.000Z'));
    const rescheduled = buildReminderQueueRecords({
      ...confirmed,
      startAt: '2027-01-16T10:00:00.000Z',
    }, Date.parse('2027-01-14T08:00:00.000Z'));
    assert.notEqual(original[0].id, rescheduled[0].id);
    assert.ok(rescheduled[0].id.includes(String(Date.parse('2027-01-16T10:00:00.000Z'))));
  });

  it('calculates bounded exponential retry delays', () => {
    assert.equal(getReminderRetryDelayMs(1), 60_000);
    assert.equal(getReminderRetryDelayMs(2), 120_000);
    assert.equal(getReminderRetryDelayMs(3), 240_000);
    assert.equal(getReminderRetryDelayMs(99), 60 * 60_000);
  });

  it('requires a valid job ID and lease token before releasing a claim', async () => {
    await assert.rejects(
      () => releaseAppointmentReminderClaim('../unsafe', '', '2027-01-15T10:00:00.000Z', 'failure'),
      /Invalid reminder claim/
    );
  });

  it('does not create jobs for unconfirmed appointments or overdue reminder deadlines', () => {
    assert.deepEqual(
      buildReminderQueueRecords({ ...confirmed, status: 'pending' }, Date.parse('2027-01-14T08:00:00.000Z')),
      []
    );
    const late = buildReminderQueueRecords(confirmed, Date.parse('2027-01-15T09:15:00.000Z'));
    assert.deepEqual(late.map((job) => job.offset), ['30m', '30m']);
  });
});

describe('ISHYA reminder worker authentication', () => {
  const secret = 'a'.repeat(48);

  it('accepts only the configured Bearer secret', () => {
    assert.equal(isValidReminderWorkerAuthorization(`Bearer ${secret}`, secret), true);
    assert.equal(isValidReminderWorkerAuthorization(`Bearer ${'b'.repeat(48)}`, secret), false);
    assert.equal(isValidReminderWorkerAuthorization(secret, secret), false);
  });

  it('fails closed when the secret is absent, short, or the header is missing', () => {
    assert.equal(isValidReminderWorkerAuthorization(undefined, secret), false);
    assert.equal(isValidReminderWorkerAuthorization(`Bearer ${secret}`, undefined), false);
    assert.equal(isValidReminderWorkerAuthorization(`Bearer ${secret}`, 'short'), false);
  });
});


describe('ISHYA WhatsApp appointment reminder adapter', () => {
  const templateInput = {
    customerName: 'Aline',
    businessName: 'ISHYA Salon',
    serviceName: 'Hair styling',
    startAt: '2027-01-15T10:00:00.000Z',
    timeZone: 'Africa/Kigali',
    language: 'en' as const,
  };

  it('builds the approved four-parameter WhatsApp template payload', () => {
    const payload = buildAppointmentReminderTemplatePayload(
      '+250788123456',
      templateInput,
      'appointment_reminder',
      'en'
    );
    assert.equal(payload.to, '250788123456');
    assert.equal(payload.template.name, 'appointment_reminder');
    assert.equal(payload.template.components[0].parameters.length, 4);
    assert.deepEqual(
      payload.template.components[0].parameters.slice(0, 3).map((item) => item.text),
      ['Aline', 'ISHYA Salon', 'Hair styling']
    );
  });

  it('rejects invalid recipients and incomplete template data', () => {
    assert.throws(
      () => buildAppointmentReminderTemplatePayload('0788123456', templateInput, 'appointment_reminder', 'en'),
      /recipient/
    );
    assert.throws(
      () => buildAppointmentReminderTemplatePayload('+250788123456', { ...templateInput, businessName: '' }, 'appointment_reminder', 'en'),
      /incomplete/
    );
  });

  it('requires the appointment to remain confirmed and at the queued start time', () => {
    const queued = { appointmentId: 'apt_1', appointmentStartAt: templateInput.startAt };
    assert.equal(isReminderAppointmentCurrent(queued, { id: 'apt_1', status: 'confirmed', startAt: templateInput.startAt }), true);
    assert.equal(isReminderAppointmentCurrent(queued, { id: 'apt_1', status: 'cancelled', startAt: templateInput.startAt }), false);
    assert.equal(isReminderAppointmentCurrent(queued, { id: 'apt_1', status: 'confirmed', startAt: '2027-01-16T10:00:00.000Z' }), false);
  });
});


describe('ISHYA WhatsApp reminder worker configuration and safety', () => {
  it('exports bounded WhatsApp and in-app worker processors', () => {
    assert.equal(typeof processDueWhatsAppAppointmentReminders, 'function');
    assert.equal(typeof processDueInAppAppointmentReminders, 'function');
  });
});


describe('ISHYA IntouchSMS appointment reminder adapter', () => {
  const smsInput = {
    customerName: 'Aline',
    businessName: 'ISHYA Salon',
    serviceName: 'Hair styling',
    startAt: '2027-01-15T10:00:00.000Z',
    timeZone: 'Africa/Kigali',
    language: 'en' as const,
  };

  it('builds localized appointment reminders and sends with HTTP Basic authentication', async () => {
    assert.match(buildIntouchAppointmentSmsMessage(smsInput), /ISHYA: reminder for Aline/);
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const result = await sendIntouchAppointmentSms('+250788123456', smsInput, {
      username: 'test-user',
      password: 'test-password',
      senderId: 'ISHYA',
    }, async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({
        success: true,
        details: [{ status: 'P', messageid: 12345 }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    assert.equal(capturedUrl, 'https://www.intouchsms.co.rw/api/sendsms/.json');
    assert.equal(capturedInit?.method, 'POST');
    assert.match(String((capturedInit?.headers as Record<string, string>).Authorization), /^Basic /);
    assert.match(String(capturedInit?.body), /recipients=%2B250788123456/);
    assert.deepEqual(result, { messageId: '12345', providerStatus: 'P' });
  });

  it('rejects invalid recipients, sender IDs and unsuccessful provider responses', async () => {
    await assert.rejects(
      sendIntouchAppointmentSms('0788123456', smsInput, { username: 'u', password: 'p', senderId: 'ISHYA' }),
      /recipient/
    );
    await assert.rejects(
      sendIntouchAppointmentSms('+250788123456', smsInput, { username: 'u', password: 'p', senderId: 'ISHYA BRAND' }),
      /sender ID/
    );
    await assert.rejects(
      sendIntouchAppointmentSms('+250788123456', smsInput, { username: 'u', password: 'p', senderId: 'ISHYA' }, async () =>
        new Response(JSON.stringify({ success: false, details: [{ status: 'E' }] }), { status: 400 })
      ),
      /rejected/
    );
  });

  it('exposes the bounded IntouchSMS worker processor', () => {
    assert.equal(typeof processDueIntouchSmsAppointmentReminders, 'function');
  });
});
