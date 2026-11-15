import type { Language } from '../types';

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

let cachedCountriesPromise: Promise<CountryOption[]> | null = null;
const cachedRegions = new Map<string, Promise<RegionOption[]>>();

export function fetchCountries(): Promise<CountryOption[]> {
  if (!cachedCountriesPromise) {
    cachedCountriesPromise = fetch('/api/locations/countries')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load countries');
        return res.json();
      })
      .then((data: { countries?: CountryOption[] }) => data.countries ?? [])
      .catch((err) => {
        cachedCountriesPromise = null;
        throw err;
      });
  }
  return cachedCountriesPromise;
}

export function fetchRegionsForCountry(countryCode: string): Promise<RegionOption[]> {
  const code = countryCode.trim().toUpperCase();
  if (!code) return Promise.resolve([]);
  const existing = cachedRegions.get(code);
  if (existing) return existing;

  const promise = fetch(
    `/api/locations/regions?country=${encodeURIComponent(code)}`
  )
    .then((res) => {
      if (!res.ok) throw new Error('Failed to load regions');
      return res.json();
    })
    .then((data: { regions?: RegionOption[] }) => data.regions ?? [])
    .catch((err) => {
      cachedRegions.delete(code);
      throw err;
    });

  cachedRegions.set(code, promise);
  return promise;
}

export async function fetchCitiesForLocation(params: {
  countryCode: string;
  regionName?: string;
  query?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{ cities: CityOption[]; total: number; hasMore: boolean }> {
  const code = params.countryCode.trim().toUpperCase();
  if (!code) return { cities: [], total: 0, hasMore: false };

  const search = new URLSearchParams({
    country: code,
    limit: String(params.limit ?? 100),
  });
  if (params.regionName?.trim()) {
    search.set('region', params.regionName.trim());
  }
  if (params.query?.trim()) {
    search.set('q', params.query.trim());
  }

  const res = await fetch(`/api/locations/cities?${search.toString()}`, {
    signal: params.signal,
  });
  if (!res.ok) {
    throw new Error('Failed to load cities');
  }
  const data = (await res.json()) as {
    cities?: CityOption[];
    total?: number;
    hasMore?: boolean;
  };
  return {
    cities: data.cities ?? [],
    total: data.total ?? 0,
    hasMore: Boolean(data.hasMore),
  };
}

export function getCountryDisplayName(
  country: Pick<CountryOption, 'nameEn' | 'nameFr' | 'nameRw'>,
  language: Language
): string {
  if (language === 'fr') return country.nameFr;
  if (language === 'rw') return country.nameRw;
  return country.nameEn;
}

export function countryCodeToFlag(countryCode?: string): string {
  const clean = (countryCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  return String.fromCodePoint(
    0x1f1e6 + clean.charCodeAt(0) - 65,
    0x1f1e6 + clean.charCodeAt(1) - 65
  );
}
