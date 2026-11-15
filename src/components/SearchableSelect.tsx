import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

interface SearchableSelectProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  ariaLabel,
  disabled = false,
  required = false,
  id,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, searchQuery]);

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
        aria-label={ariaLabel || placeholder}
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
          {displayLabel || placeholder}
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
              placeholder={searchPlaceholder}
              className="flex-1 min-h-[40px] bg-transparent text-sm text-[#101D35] placeholder:text-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-[#101D35]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <ul
            role="listbox"
            aria-label={ariaLabel || placeholder}
            className="max-h-60 overflow-y-auto divide-y divide-slate-100"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3.5 py-3 text-xs text-slate-500 text-center">
                {emptyMessage}
              </li>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = displayLabel === option;
                return (
                  <li key={option}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-[#FBF7EC] text-[#101D35] font-medium'
                          : 'text-[#101D35] hover:bg-[#E9EEF5]/65'
                      }`}
                    >
                      <span className="truncate">{option}</span>
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
