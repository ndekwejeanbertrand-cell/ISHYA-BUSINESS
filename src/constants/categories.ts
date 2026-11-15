import type { Language } from '../types';

export interface BusinessCategoryOption {
  value: string;
  labels: Record<Language, string>;
}

export const BUSINESS_CATEGORIES: readonly BusinessCategoryOption[] = [
  {
    value: 'Restaurant & Café',
    labels: {
      en: 'Restaurant & Café',
      rw: 'Resitora na Kafe',
      fr: 'Restaurant & Café',
    },
  },
  {
    value: 'Hotel & Guest House',
    labels: {
      en: 'Hotel & Guest House',
      rw: 'Hoteli n’Icumbi',
      fr: 'Hôtel & Maison d’hôtes',
    },
  },
  {
    value: 'Salon & Beauty',
    labels: {
      en: 'Salon & Beauty',
      rw: 'Salo y’Ubwiza',
      fr: 'Salon & Beauté',
    },
  },
  {
    value: 'Barber Shop',
    labels: {
      en: 'Barber Shop',
      rw: 'Inzu yo Kogosha',
      fr: 'Salon de Coiffure Homme',
    },
  },
  {
    value: 'Boutique & Fashion',
    labels: {
      en: 'Boutique & Fashion',
      rw: 'Butiki n’Imyambaro',
      fr: 'Boutique & Mode',
    },
  },
  {
    value: 'Supermarket & Grocery',
    labels: {
      en: 'Supermarket & Grocery',
      rw: 'Supamaketi n’Ibiribwa',
      fr: 'Supermarché & Épicerie',
    },
  },
  {
    value: 'Electronics & Technology',
    labels: {
      en: 'Electronics & Technology',
      rw: 'Ibikoresho by’Ikoranabuhanga',
      fr: 'Électronique & Technologie',
    },
  },
  {
    value: 'Garage & Automotive',
    labels: {
      en: 'Garage & Automotive',
      rw: 'Garaje n’Ibinyabiziga',
      fr: 'Garage & Automobile',
    },
  },
  {
    value: 'Car Rental & Transport',
    labels: {
      en: 'Car Rental & Transport',
      rw: 'Gukodesha Imodoka n’Ubwikorezi',
      fr: 'Location de Voitures & Transport',
    },
  },
  {
    value: 'Real Estate',
    labels: {
      en: 'Real Estate',
      rw: 'Imitungo Itimukanwa',
      fr: 'Immobilier',
    },
  },
  {
    value: 'Travel & Tourism',
    labels: {
      en: 'Travel & Tourism',
      rw: 'Ubukerarugendo n’Ingendo',
      fr: 'Voyage & Tourisme',
    },
  },
  {
    value: 'Pharmacy & Healthcare',
    labels: {
      en: 'Pharmacy & Healthcare',
      rw: 'Farumasi n’Ubuvuzi',
      fr: 'Pharmacie & Santé',
    },
  },
  {
    value: 'Education & Training',
    labels: {
      en: 'Education & Training',
      rw: 'Uburezi n’Amahugurwa',
      fr: 'Éducation & Formation',
    },
  },
  {
    value: 'Construction & Hardware',
    labels: {
      en: 'Construction & Hardware',
      rw: 'Ubwubatsi n’Ibikoresho',
      fr: 'Construction & Quincaillerie',
    },
  },
  {
    value: 'Professional Services',
    labels: {
      en: 'Professional Services',
      rw: 'Serivisi z’Umwuga',
      fr: 'Services Professionnels',
    },
  },
  {
    value: 'Other',
    labels: {
      en: 'Other',
      rw: 'Ikindi cyiciro',
      fr: 'Autre',
    },
  },
] as const;

export const OTHER_CATEGORY_VALUE = 'Other';

const STANDARD_CATEGORY_MAP = new Map<string, BusinessCategoryOption>(
  BUSINESS_CATEGORIES.filter((c) => c.value !== OTHER_CATEGORY_VALUE).map((c) => [
    c.value,
    c,
  ])
);

export function isStandardCategory(value: string): boolean {
  return STANDARD_CATEGORY_MAP.has(value.trim());
}

export function getCategoryLabel(value: string, language: Language): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === OTHER_CATEGORY_VALUE) {
    const other = BUSINESS_CATEGORIES.find((c) => c.value === OTHER_CATEGORY_VALUE);
    return other ? other.labels[language] : OTHER_CATEGORY_VALUE;
  }
  const match = STANDARD_CATEGORY_MAP.get(trimmed);
  return match ? match.labels[language] : trimmed;
}
