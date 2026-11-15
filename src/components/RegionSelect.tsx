import React, { useEffect, useMemo, useState } from 'react';
import type { Language } from '../types';
import { TRANSLATIONS } from '../i18n';
import { fetchRegionsForCountry, type RegionOption } from '../services/locationsApi';
import { SearchableSelect } from './SearchableSelect';

interface RegionSelectProps {
  countryCode: string;
  value: string;
  onChange: (region: string) => void;
  language: Language;
  id?: string;
}

export const RegionSelect: React.FC<RegionSelectProps> = ({
  countryCode,
  value,
  onChange,
  language,
  id,
}) => {
  const t = TRANSLATIONS[language];
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const code = countryCode.trim().toUpperCase();
    if (!code || code === 'RW') {
      setRegions([]);
      return;
    }

    let active = true;
    setIsLoading(true);
    fetchRegionsForCountry(code)
      .then((list) => {
        if (active) setRegions(list);
      })
      .catch(() => {
        if (active) setRegions([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [countryCode]);

  const regionNames = useMemo(() => regions.map((r) => r.name), [regions]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-slate-400 flex items-center">
        {t.loadingLocations}
      </div>
    );
  }

  if (regionNames.length === 0) {
    return (
      <input
        id={id}
        type="text"
        maxLength={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.regionLabel}
        aria-label={t.regionLabel}
        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
      />
    );
  }

  return (
    <SearchableSelect
      id={id}
      options={regionNames}
      value={value}
      onChange={onChange}
      placeholder={t.selectRegionPlaceholder}
      searchPlaceholder={t.regionSearchPlaceholder}
      emptyMessage={t.noLocationMatch}
      ariaLabel={t.regionLabel}
    />
  );
};
