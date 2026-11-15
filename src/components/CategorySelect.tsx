import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Language } from '../types';
import {
  BUSINESS_CATEGORIES,
  isStandardCategory,
  OTHER_CATEGORY_VALUE,
} from '../constants/categories';
import { TRANSLATIONS } from '../i18n';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  required?: boolean;
  id?: string;
  placeholderSuffix?: string;
}

export const CategorySelect: React.FC<CategorySelectProps> = ({
  value,
  onChange,
  language,
  required = false,
  id,
  placeholderSuffix = '',
}) => {
  const t = TRANSLATIONS[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [otherSelected, setOtherSelected] = useState<boolean>(() => {
    const trimmed = value.trim();
    return Boolean(trimmed && !isStandardCategory(trimmed));
  });
  const [customText, setCustomText] = useState<string>(() => {
    const trimmed = value.trim();
    return trimmed && !isStandardCategory(trimmed) && trimmed !== OTHER_CATEGORY_VALUE
      ? trimmed
      : '';
  });

  // Keep internal state synced when external value changes (e.g., switching business draft or resetting form)
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed) {
      // Preserve explicit "Other" selection if the user just picked Other and hasn't typed yet
      if (!otherSelected) {
        setCustomText('');
      }
      return;
    }
    if (isStandardCategory(trimmed)) {
      setOtherSelected(false);
      setCustomText('');
    } else {
      setOtherSelected(true);
      setCustomText(trimmed === OTHER_CATEGORY_VALUE ? '' : trimmed);
    }
  }, [value]);

  // Close dropdown on outside pointer click or Escape key
  useEffect(() => {
    if (!isOpen) return;

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
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
    setSearchQuery('');
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return BUSINESS_CATEGORIES;
    return BUSINESS_CATEGORIES.filter((opt) => {
      const localized = opt.labels[language].toLowerCase();
      const canonical = opt.value.toLowerCase();
      return localized.includes(q) || canonical.includes(q);
    });
  }, [searchQuery, language]);

  const selectedLabel = useMemo(() => {
    if (otherSelected) {
      const otherOpt = BUSINESS_CATEGORIES.find(
        (c) => c.value === OTHER_CATEGORY_VALUE
      );
      return otherOpt ? otherOpt.labels[language] : OTHER_CATEGORY_VALUE;
    }
    const trimmed = value.trim();
    if (!trimmed) return '';
    const match = BUSINESS_CATEGORIES.find((c) => c.value === trimmed);
    return match ? match.labels[language] : trimmed;
  }, [otherSelected, value, language]);

  const handleSelectOption = (optionValue: string) => {
    if (optionValue === OTHER_CATEGORY_VALUE) {
      setOtherSelected(true);
      onChange(customText.trim());
      setIsOpen(false);
      setTimeout(() => customInputRef.current?.focus(), 20);
    } else {
      setOtherSelected(false);
      setCustomText('');
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  const handleCustomChange = (nextText: string) => {
    setCustomText(nextText);
    onChange(nextText.trimStart());
  };

  const validationValue = otherSelected ? customText.trim() : value.trim();

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        {/* Visually hidden native input to participate seamlessly in HTML5 required form validation */}
        <input
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          required={required}
          value={validationValue}
          onChange={() => {}}
          onInvalid={() => setIsOpen(true)}
          className="opacity-0 pointer-events-none absolute inset-0 w-full h-full"
        />

        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border text-sm text-left flex items-center justify-between gap-2 transition-colors focus:outline-none ${
            isOpen
              ? 'border-[#101D35] bg-white'
              : 'border-slate-200 hover:border-[#D9B96E]'
          }`}
        >
          <span
            className={`truncate ${
              selectedLabel ? 'text-[#101D35]' : 'text-slate-500'
            }`}
          >
            {selectedLabel ||
              `${t.selectCategoryPlaceholder}${placeholderSuffix}`}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-[#101D35]' : ''
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
                placeholder={t.categorySearchPlaceholder}
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
              aria-label={t.categoryLabel}
              className="max-h-60 overflow-y-auto divide-y divide-slate-100"
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                  {t.noCategoriesMatch}
                </li>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected =
                    opt.value === OTHER_CATEGORY_VALUE
                      ? otherSelected
                      : !otherSelected && value.trim() === opt.value;

                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectOption(opt.value)}
                        className={`w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[#FBF7EC] text-[#101D35] font-medium'
                            : 'text-[#101D35] hover:bg-[#E9EEF5]/65'
                        }`}
                      >
                        <span className="truncate">{opt.labels[language]}</span>
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

      {otherSelected && (
        <input
          ref={customInputRef}
          type="text"
          required={required}
          maxLength={80}
          value={customText}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={`${t.customCategoryPlaceholder}${required ? ' *' : ''}`}
          aria-label={t.customCategoryPlaceholder}
          className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-[#D9B96E]/70 text-sm text-[#101D35] placeholder:text-slate-500 focus:outline-none focus:border-[#101D35]"
        />
      )}
    </div>
  );
};
