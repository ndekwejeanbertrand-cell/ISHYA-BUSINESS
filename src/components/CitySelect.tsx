import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Edit3, List, Search, X } from 'lucide-react';
import type { Language } from '../types';
import { TRANSLATIONS } from '../i18n';
import {
  fetchCitiesForLocation,
  type CityOption,
} from '../services/locationsApi';

interface CitySelectProps {
  countryCode: string;
  regionName?: string;
  value: string;
  onChange: (city: string) => void;
  language: Language;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  placeholderSuffix?: string;
}

export const CitySelect: React.FC<CitySelectProps> = ({
  countryCode,
  regionName,
  value,
  onChange,
  language,
  disabled = false,
  required = false,
  id,
  placeholderSuffix = '',
}) => {
  const t = TRANSLATIONS[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState<CityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isManual, setIsManual] = useState(false);

  // Reset city state cleanly whenever country changes
  useEffect(() => {
    setCities([]);
    setSearchQuery('');
    setIsManual(false);
  }, [countryCode]);

  // Reset manual mode if value is cleared externally
  useEffect(() => {
    if (!value.trim() && isManual && document.activeElement !== manualInputRef.current) {
      setIsManual(false);
    }
  }, [value, isManual]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

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

  // Fetch matching cities from server dataset whenever open or query/country/region changes
  useEffect(() => {
    if (!isOpen || !countryCode.trim()) return;

    const controller = new AbortController();
    setIsLoading(true);
    const delay = searchQuery ? 160 : 0;

    const timer = setTimeout(() => {
      fetchCitiesForLocation({
        countryCode,
        regionName,
        query: searchQuery,
        limit: 100,
        signal: controller.signal,
      })
        .then((res) => {
          setCities(res.cities);
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setCities([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, countryCode, regionName, searchQuery]);

  if (isManual) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            ref={manualInputRef}
            id={id}
            type="text"
            required={required && !disabled}
            disabled={disabled}
            maxLength={80}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`${t.manualCityPlaceholder}${placeholderSuffix}`}
            aria-label={t.cityLabel}
            className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-[#D9B96E]/70 text-sm text-[#101D35] placeholder:text-slate-500 focus:outline-none focus:border-[#101D35]"
          />
          <button
            type="button"
            onClick={() => {
              setIsManual(false);
              setIsOpen(true);
            }}
            title={t.backToCityList}
            aria-label={t.backToCityList}
            className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-[#E9EEF5]/60 text-xs font-medium text-[#101D35] inline-flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <List className="w-4 h-4 text-[#7D611F]" aria-hidden="true" />
            <span className="hidden sm:inline">{t.cityLabel}</span>
          </button>
        </div>
      </div>
    );
  }

  const displayLabel = value.trim();

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        required={required && !disabled}
        value={displayLabel}
        onChange={() => {}}
        onInvalid={() => {
          if (!disabled) setIsOpen(true);
        }}
        className="opacity-0 pointer-events-none absolute inset-0 w-full h-full"
      />

      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t.cityLabel}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border text-sm text-left flex items-center justify-between gap-2 transition-colors focus:outline-none ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-[#101D35]'
            : 'bg-[#E9EEF5]/60 border-slate-200 hover:border-[#D9B96E]'
        }`}
      >
        <span
          className={`truncate ${
            disabled
              ? 'text-slate-400'
              : displayLabel
              ? 'text-[#101D35]'
              : 'text-slate-500'
          }`}
        >
          {displayLabel || `${t.selectCityPlaceholder}${placeholderSuffix}`}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${
            disabled
              ? 'text-slate-300'
              : isOpen
              ? 'rotate-180 text-[#101D35]'
              : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && !disabled && (
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
              placeholder={t.citySearchPlaceholder}
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
            aria-label={t.cityLabel}
            className="max-h-56 overflow-y-auto divide-y divide-slate-100"
          >
            {isLoading ? (
              <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                {t.loadingLocations}
              </li>
            ) : cities.length === 0 ? (
              <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                {t.noLocationMatch}
              </li>
            ) : (
              cities.map((city) => {
                const key = `${city.name}-${city.stateCode}`;
                const isSelected = displayLabel === city.name;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(city.name);
                        setIsOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-[#FBF7EC] text-[#101D35] font-medium'
                          : 'text-[#101D35] hover:bg-[#E9EEF5]/65'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span>{city.name}</span>
                        {city.stateName && (
                          <span className="ml-1.5 text-xs text-slate-400">
                            · {city.stateName}
                          </span>
                        )}
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

          <div className="p-2 border-t border-slate-100 bg-[#E9EEF5]/35">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsManual(true);
                if (searchQuery.trim() && !value.trim()) {
                  onChange(searchQuery.trim());
                }
                setTimeout(() => manualInputRef.current?.focus(), 20);
              }}
              className="w-full min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium text-[#7D611F] hover:bg-[#FBF7EC] inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{t.enterCityManually}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
