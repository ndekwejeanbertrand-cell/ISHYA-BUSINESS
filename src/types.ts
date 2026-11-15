export type Language = 'rw' | 'en' | 'fr';

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface DayHours {
  day: DayOfWeek;
  open: string;
  close: string;
  closed: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  priceRwf: number;
  durationOrUnit: string;
  description: string;
}

export interface BusinessProfile {
  id: string;
  ownerId?: string;
  slug: string;
  name: string;
  category: string;
  isDemo: boolean;
  isPublished?: boolean;
  demoLabel?: string;
  description: string;
  address: string;
  countryCode?: string;
  countryName?: string;
  region?: string;
  district: string;
  sector?: string;
  city: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  humanHandoffNote: string;
  hours: DayHours[];
  services: ServiceItem[];
  createdAt?: string;
  updatedAt: string;
}

export interface OwnerProfile {
  uid: string;
  displayName: string;
  email: string;
  preferredLanguage: Language;
}

export interface WhatsAppIntegrationConfig {
  businessId: string;
  ownerId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  webhookEnabled: boolean;
}

export interface WhatsAppStatusResponse {
  cloudApiConfigured: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
  webhookPath: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  needsHumanAssistance?: boolean;
  detectedLanguage?: Language;
  timestamp: string;
}
