import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { BusinessProfile, ChatTurn, Language } from '../src/types.ts';

const LANGUAGE_LABELS: Record<Language, string> = {
  rw: 'Kinyarwanda',
  en: 'English',
  fr: 'French',
};

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export interface AssistantReplyPayload {
  reply: string;
  needsHumanAssistance: boolean;
  detectedLanguage: Language;
}

export function buildSystemInstruction(business: BusinessProfile, uiLanguage: Language): string {
  const isolatedProfile = {
    name: business.name,
    category: business.category,
    description: business.description || null,
    location: {
      address: business.address || null,
      sector: business.sector || null,
      district: business.district || null,
      region: business.region || null,
      city: business.city || null,
      countryName: business.countryName || null,
      countryCode: business.countryCode || null,
    },
    contact: {
      phone: business.phone || null,
      whatsappNumber: business.whatsappNumber || null,
      email: business.email || null,
    },
    openingHours: business.hours.map((h) => ({
      day: h.day,
      status: h.closed ? 'Closed' : `${h.open} - ${h.close}`,
    })),
    servicesAndPricesRwf: business.services.map((s) => ({
      name: s.name,
      priceRwf: s.priceRwf,
      durationOrUnit: s.durationOrUnit || null,
      description: s.description || null,
    })),
    humanHandoffNote: business.humanHandoffNote || null,
  };

  return [
    `You are ISHYA Business, a polite, concise, trustworthy customer assistant dedicated strictly to "${business.name}".`,
    '',
    'CRITICAL RULES:',
    '1. STRICT DATA ISOLATION: Answer ONLY from the VERIFIED BUSINESS DATA JSON below. You have zero knowledge of any other business.',
    '2. NEVER INVENT INFORMATION: Never guess or invent prices, services, discounts, addresses, staff names, availability, payment methods, parking, home-service policies, or opening hours not explicitly present in VERIFIED BUSINESS DATA.',
    '3. MISSING INFORMATION PROTOCOL: If the customer asks about something that is missing, empty, or not stated in VERIFIED BUSINESS DATA (or asks to book an appointment, negotiate prices, or speak to a human), clearly state that the specific information is not listed in the business profile, set "needsHumanAssistance" to true, and invite them to reach a person directly via the business WhatsApp contact button or listed phone number.',
    '4. NO FAKE AUTOMATION: Never claim that you can book appointments, take payments, or send WhatsApp messages automatically via an API. Clearly guide the customer to tap the WhatsApp contact button to message the business team directly.',
    `5. MULTILINGUAL SUPPORT: The customer's active interface language is ${LANGUAGE_LABELS[uiLanguage]} (${uiLanguage}). Reply in ${LANGUAGE_LABELS[uiLanguage]} unless the customer clearly wrote their question in another supported language (Kinyarwanda, English, or French), in which case reply in the customer's message language. Keep Kinyarwanda natural, respectful, and accurate (e.g., "Muraho", "Murakoze", "RWF").`,
    '6. CONCISE FORMATTING: Keep replies crisp, helpful, and easy to read on mobile screens (short paragraphs or simple plain-text lines, format prices like 15,000 RWF).',
    '7. PRIVACY: Never ask the customer for unnecessary personal data (no ID numbers, home address, or personal financial details).',
    '',
    'VERIFIED BUSINESS DATA (JSON):',
    JSON.stringify(isolatedProfile, null, 2),
  ].join('\n');
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isTransient =
        message.includes('503') ||
        message.includes('500') ||
        message.includes('UNAVAILABLE') ||
        message.includes('ECONNRESET');
      if (!isTransient || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export async function generateBusinessReply(params: {
  business: BusinessProfile;
  language: Language;
  message: string;
  history: ChatTurn[];
}): Promise<AssistantReplyPayload> {
  const ai = getAiClient();
  const { business, language, message, history } = params;

  const recentHistory = history.slice(-10).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }],
  }));

  const contents = [
    ...recentHistory,
    {
      role: 'user',
      parts: [{ text: message }],
    },
  ];

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents,
      config: {
        systemInstruction: buildSystemInstruction(business, language),
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: 'Helpful customer-facing reply grounded strictly in the verified business data.',
            },
            needsHumanAssistance: {
              type: Type.BOOLEAN,
              description:
                'True if requested info is missing from the verified data or the user wants to book/speak with a human.',
            },
            detectedLanguage: {
              type: Type.STRING,
              description: 'Language code of the reply: rw, en, or fr.',
            },
          },
          required: ['reply', 'needsHumanAssistance', 'detectedLanguage'],
        },
      },
    })
  );

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Empty response from Gemini.');
  }

  const parsed = JSON.parse(rawText) as Partial<AssistantReplyPayload>;
  const lang =
    parsed.detectedLanguage === 'rw' ||
    parsed.detectedLanguage === 'en' ||
    parsed.detectedLanguage === 'fr'
      ? parsed.detectedLanguage
      : language;

  return {
    reply: String(parsed.reply ?? '').trim(),
    needsHumanAssistance: Boolean(parsed.needsHumanAssistance),
    detectedLanguage: lang,
  };
}
