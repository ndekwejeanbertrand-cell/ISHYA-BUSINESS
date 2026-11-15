import { City, Country, State } from 'country-state-city';
import type { Language } from '../src/types.ts';

export interface CountryOption {
  code: string;
  flag: string;
  nameEn: string;
  nameFr: string;
  nameRw: string;
}

export interface RegionOption {
  code: string;
  name: string;
}

export interface CityOption {
  name: string;
  stateCode: string;
  stateName?: string;
}

const RWANDA_COUNTRY_NAMES: Record<string, string> = {
  RW: 'U Rwanda',
  KE: 'Kenya',
  UG: 'Uganda',
  TZ: 'Tanzaniya',
  BI: 'Uburundi',
  CD: 'Repubulika Iharanira Demokarasi ya Kongo',
  CG: 'Kongo-Brazzaville',
  SS: 'Sudani y’Epfo',
  SD: 'Sudani',
  ET: 'Etiyopiya',
  SO: 'Somaliya',
  DJ: 'Jibuti',
  ER: 'Eritereya',
  ZA: 'Afurika y’Epfo',
  NG: 'Nijeriya',
  GH: 'Gana',
  SN: 'Senegali',
  CI: 'Kote Divuwari',
  CM: 'Kameruni',
  EG: 'Misiri',
  MA: 'Maroke',
  DZ: 'Alijeriya',
  TN: 'Tuniziya',
  ZM: 'Zambiya',
  ZW: 'Zimbabwe',
  MW: 'Malawi',
  MZ: 'Mozambike',
  AO: 'Angola',
  NA: 'Namibiya',
  BW: 'Botswana',
  GB: 'Ubwongereza',
  US: 'Leta Zunze Ubumwe za Amerika',
  FR: 'Ubufaransa',
  BE: 'Ububiligi',
  DE: 'Ubudage',
  CH: 'Ubusuwisi',
  IT: 'Ubutaliyani',
  ES: 'Esipanye',
  PT: 'Porutigali',
  NL: 'Ubuholandi',
  SE: 'Suwede',
  NO: 'Noruveje',
  DK: 'Danemarke',
  IE: 'Irilande',
  CA: 'Kanada',
  BR: 'Burezili',
  MX: 'Megizike',
  AR: 'Arijantine',
  CN: 'Ubushinwa',
  JP: 'Ubuyapani',
  IN: 'Ubuhinde',
  KR: 'Koreya y’Epfo',
  AE: 'Leta Zunze Ubumwe z’Abarabu',
  SA: 'Arabiya Sawudite',
  QA: 'Katari',
  TR: 'Turukiya',
  IL: 'Isirayeli',
  RU: 'Uburusiya',
  AU: 'Ositaraliya',
  NZ: 'Nuveli Zelande',
};

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function safeDisplayName(
  dn: Intl.DisplayNames | null,
  code: string,
  fallback: string
): string {
  if (!dn) return fallback;
  try {
    const resolved = dn.of(code);
    if (!resolved || resolved.toUpperCase() === code.toUpperCase()) {
      return fallback;
    }
    return resolved;
  } catch {
    return fallback;
  }
}

let cachedCountries: CountryOption[] | null = null;

export function getAllCountries(): CountryOption[] {
  if (cachedCountries) {
    return cachedCountries;
  }

  let dnEn: Intl.DisplayNames | null = null;
  let dnFr: Intl.DisplayNames | null = null;
  let dnRw: Intl.DisplayNames | null = null;

  try {
    dnEn = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    dnEn = null;
  }
  try {
    dnFr = new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    dnFr = null;
  }
  try {
    dnRw = new Intl.DisplayNames(['rw'], { type: 'region' });
  } catch {
    dnRw = null;
  }

  const list = Country.getAllCountries().map((c) => {
    const nameEn = c.name || safeDisplayName(dnEn, c.isoCode, c.isoCode);
    const nameFr = safeDisplayName(dnFr, c.isoCode, nameEn);
    const nameRw =
      RWANDA_COUNTRY_NAMES[c.isoCode] ?? safeDisplayName(dnRw, c.isoCode, nameEn);

    return {
      code: c.isoCode,
      flag: c.flag || '',
      nameEn,
      nameFr,
      nameRw,
    };
  });

  // Sort alphabetically by English name, with Rwanda pinned first
  list.sort((a, b) => {
    if (a.code === 'RW') return -1;
    if (b.code === 'RW') return 1;
    return a.nameEn.localeCompare(b.nameEn);
  });

  cachedCountries = list;
  return cachedCountries;
}

export function getCountryByCode(code: string): CountryOption | null {
  const upper = code.trim().toUpperCase();
  if (!upper) return null;
  return getAllCountries().find((c) => c.code === upper) ?? null;
}

export function getCountryNameForLanguage(
  country: Pick<CountryOption, 'nameEn' | 'nameFr' | 'nameRw'>,
  language: Language
): string {
  if (language === 'fr') return country.nameFr;
  if (language === 'rw') return country.nameRw;
  return country.nameEn;
}

export function searchCountries(query?: string): CountryOption[] {
  const all = getAllCountries();
  const q = normalizeSearch(query ?? '');
  if (!q) return all;

  const matched = all.filter((c) => {
    return (
      normalizeSearch(c.code) === q ||
      normalizeSearch(c.nameEn).includes(q) ||
      normalizeSearch(c.nameFr).includes(q) ||
      normalizeSearch(c.nameRw).includes(q)
    );
  });

  matched.sort((a, b) => {
    const aStarts =
      normalizeSearch(a.nameEn).startsWith(q) ||
      normalizeSearch(a.nameFr).startsWith(q) ||
      normalizeSearch(a.nameRw).startsWith(q);
    const bStarts =
      normalizeSearch(b.nameEn).startsWith(q) ||
      normalizeSearch(b.nameFr).startsWith(q) ||
      normalizeSearch(b.nameRw).startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.nameEn.localeCompare(b.nameEn);
  });

  return matched;
}

export function getRegionsForCountry(
  countryCode: string,
  query?: string
): RegionOption[] {
  const code = countryCode.trim().toUpperCase();
  if (!code) return [];
  const states = State.getStatesOfCountry(code) ?? [];
  const q = normalizeSearch(query ?? '');

  const mapped = states
    .map((s) => ({
      code: s.isoCode,
      name: s.name,
    }))
    .filter((s) => !q || normalizeSearch(s.name).includes(q));

  mapped.sort((a, b) => a.name.localeCompare(b.name));
  return mapped;
}

export function searchCitiesForCountry(options: {
  countryCode: string;
  stateCode?: string;
  regionName?: string;
  query?: string;
  limit?: number;
}): { cities: CityOption[]; total: number; hasMore: boolean } {
  const code = options.countryCode.trim().toUpperCase();
  if (!code) {
    return { cities: [], total: 0, hasMore: false };
  }

  const states = State.getStatesOfCountry(code) ?? [];
  const stateNameByCode = new Map<string, string>();
  let resolvedStateCode = (options.stateCode ?? '').trim();

  for (const s of states) {
    stateNameByCode.set(s.isoCode, s.name);
    if (
      !resolvedStateCode &&
      options.regionName &&
      normalizeSearch(s.name) === normalizeSearch(options.regionName)
    ) {
      resolvedStateCode = s.isoCode;
    }
  }

  const rawCities = resolvedStateCode
    ? City.getCitiesOfState(code, resolvedStateCode) ?? []
    : City.getCitiesOfCountry(code) ?? [];

  const q = normalizeSearch(options.query ?? '');
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 250);

  const prefixMatches: CityOption[] = [];
  const substringMatches: CityOption[] = [];
  const seen = new Set<string>();

  for (const c of rawCities) {
    const cleanName = c.name.trim();
    if (!cleanName) continue;
    const normName = normalizeSearch(cleanName);
    if (q && !normName.includes(q)) continue;

    // Deduplicate identical city+state pairs; if no state filter, allow disambiguated cities across states
    const stateName = stateNameByCode.get(c.stateCode) ?? undefined;
    const dedupeKey = resolvedStateCode
      ? normName
      : `${normName}|${c.stateCode}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const item: CityOption = {
      name: cleanName,
      stateCode: c.stateCode,
      stateName: !resolvedStateCode ? stateName : undefined,
    };

    if (q && normName.startsWith(q)) {
      prefixMatches.push(item);
    } else {
      substringMatches.push(item);
    }
  }

  const allMatches = [...prefixMatches, ...substringMatches];
  return {
    cities: allMatches.slice(0, limit),
    total: allMatches.length,
    hasMore: allMatches.length > limit,
  };
}
