import type { BusinessProfile, Language } from '../types';

export function formatRwf(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} RWF`;
}

export function normalizeWhatsappDigits(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

export function buildWhatsappUrl(
  business: BusinessProfile,
  language: Language,
  customMessage?: string
): string | null {
  const digits = normalizeWhatsappDigits(business.whatsappNumber);
  if (!digits || digits.length < 8) {
    return null;
  }

  const defaultMessages: Record<Language, string> = {
    en: `Hello ${business.name}, I was chatting with ISHYA Business and would like human assistance.`,
    rw: `Muraho ${business.name}, navuganaga na ISHYA Business none nkeneye ubufasha bw'umukozi.`,
    fr: `Bonjour ${business.name}, je discutais avec ISHYA Business et j'aimerais parler à un conseiller.`,
  };

  const text = encodeURIComponent(customMessage || defaultMessages[language]);
  return `https://wa.me/${digits}?text=${text}`;
}
