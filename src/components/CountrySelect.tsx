import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Language } from '../types';
import { TRANSLATIONS } from '../i18n';
import {
  countryCodeToFlag,
  fetchCountries,
  getCountryDisplayName,
  type CountryOption,
} from '../services/locationsApi';

interface CountrySelectProps {
  countryCode: string;
  countryName?: string;
  onChange: (country: { code: string; nameEn: string; displayName: string }) => void;
  language: Language;
  required?: boolean;
  id?: string;
  placeholderSuffix?: string;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  countryCode,
  countryName,
  onChange,
  language,
  required = false,
  id,
  placeholderSuffix = '',
}) => {
  const t = TRANSLATIONS[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchCountries()
      .then((list) => {
        if (active) setCountries(list);
      })
      .catch(() => {
        if (active) setCountries([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedCountry = useMemo(() => {
    const upper = countryCode.trim().toUpperCase();
    if (!upper) return null;
    return countries.find((c) => c.code === upper) ?? null;
  }, [countries, countryCode]);

  const filteredCountries = useMemo(() => {
    const q = normalizeText(searchQuery);
    if (!q) return countries;
    return countries.filter((c) => {
      return (
        normalizeText(c.code) === q ||
        normalizeText(c.nameEn).includes(q) ||
        normalizeText(c.nameFr).includes(q) ||
        normalizeText(c.nameRw).includes(q)
      );
    });
  }, [countries, searchQuery]);

  const currentFlag =
    selectedCountry?.flag || countryCodeToFlag(countryCode);
  const currentLabel = selectedCountry
    ? getCountryDisplayName(selectedCountry, language)
    : countryName?.trim() || (countryCode.trim().toUpperCase() === 'RW' ? (language === 'rw' ? 'U Rwanda' : 'Rwanda') : countryCode.trim());

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={countryCode.trim()}
        onChange={() => {}}
        onInvalid={() => setIsOpen(true)}
        className="opacity-0 pointer-events-none absolute inset-0 w-full h-full"
      />

      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t.countryLabel}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border text-sm text-left flex items-center justify-between gap-2 transition-colors focus:outline-none ${
          isOpen
            ? 'bg-white border-[#101D35]'
            : 'bg-[#E9EEF5]/60 border-slate-200 hover:border-[#D9B96E]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {currentFlag && (
            <span className="text-base leading-none shrink-0" aria-hidden="true">
              {currentFlag}
            </span>
          )}
          <span
            className={`truncate ${
              currentLabel ? 'text-[#101D35]' : 'text-slate-500'
            }`}
          >
            {currentLabel || `${t.selectCountryPlaceholder}${placeholderSuffix}`}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${
            isOpen ? 'rotate-180 text-[#101D35]' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-[#E9EEF5]/45">
            <Search
              className="w-4 h-4 text-slate-400 shrink-0 ml-1"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.countrySearchPlaceholder}
              className="flex-1 min-h-[40px] bg-transparent text-sm text-[#101D35] placeholder:text-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t.cancelButton}
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-[#101D35]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <ul
            role="listbox"
            aria-label={t.countryLabel}
            className="max-h-60 overflow-y-auto divide-y divide-slate-100"
          >
            {isLoading ? (
              <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                {t.loadingLocations}
              </li>
            ) : filteredCountries.length === 0 ? (
              <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                {t.noLocationMatch}
              </li>
            ) : (
              filteredCountries.map((country) => {
                const isSelected = country.code === countryCode.trim().toUpperCase();
                const displayName = getCountryDisplayName(country, language);
                return (
                  <li key={country.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange({
                          code: country.code,
                          nameEn: country.nameEn,
                          displayName,
                        });
                        setIsOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-[#FBF7EC] text-[#101D35] font-medium'
                          : 'text-[#101D35] hover:bg-[#E9EEF5]/65'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="text-base leading-none shrink-0" aria-hidden="true">
                          {country.flag}
                        </span>
                        <span className="truncate">{displayName}</span>
                      </span>
                      {isSelected && (
                        <Check
                          className="w-4 h-4 text-[#7D611F] shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
