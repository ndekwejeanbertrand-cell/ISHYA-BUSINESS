import React from 'react';
import { Clock, MapPin, MessageCircle, Phone, Mail, ExternalLink } from 'lucide-react';
import type { BusinessProfile, Language } from '../types';
import { TRANSLATIONS } from '../i18n';
import { buildWhatsappUrl, formatRwf } from '../utils/whatsapp';
import { getCategoryLabel } from '../constants/categories';
import { countryCodeToFlag } from '../services/locationsApi';

interface BusinessInfoPanelProps {
  business: BusinessProfile;
  language: Language;
}

export const BusinessInfoPanel: React.FC<BusinessInfoPanelProps> = ({
  business,
  language,
}) => {
  const t = TRANSLATIONS[language];
  const whatsappUrl = buildWhatsappUrl(business, language);
  const flag = countryCodeToFlag(business.countryCode);
  const summaryParts = [
    business.sector || business.region || business.city,
    business.district || business.countryName,
  ].filter(Boolean);
  const fullAddressParts = [
    business.address,
    business.sector,
    business.district,
    business.city,
    business.region,
    business.countryName ? `${flag ? `${flag} ` : ''}${business.countryName}` : '',
  ].filter(Boolean);

  return (
    <aside className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
      <div className="bg-[#101D35] text-white px-5 py-5 border-b border-[#1D3158]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold leading-snug text-white">
              {business.name}
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              {getCategoryLabel(business.category, language)}
              {summaryParts.length > 0
                ? ` · ${flag ? `${flag} ` : ''}${summaryParts.join(', ')}`
                : ''}
            </p>
          </div>
        </div>
        {business.description && (
          <p className="mt-3 text-sm text-slate-200/90 leading-relaxed">
            {business.description}
          </p>
        )}
      </div>

      <div className="p-5 space-y-6">
        {/* Direct WhatsApp & Contact */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 tracking-wide mb-3">
            {t.contactHeading}
          </h3>
          <div className="space-y-2.5 text-sm text-slate-700">
            {fullAddressParts.length > 0 && (
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#7D611F] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{fullAddressParts.join(', ')}</span>
              </div>
            )}
            {business.phone && (
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#7D611F] shrink-0" aria-hidden="true" />
                <span className="font-mono tabular-nums text-[13px]">{business.phone}</span>
              </div>
            )}
            {business.email && (
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#7D611F] shrink-0" aria-hidden="true" />
                <span className="truncate">{business.email}</span>
              </div>
            )}
          </div>

          <div className="mt-4">
            {whatsappUrl ? (
              <div>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-medium transition-colors border border-[#D9B96E]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B96E]"
                >
                  <MessageCircle className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
                  <span>{t.whatsappButton}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                </a>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  {t.whatsappDisclaimer}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-2 border-t border-slate-100">
                {t.noWhatsappConfigured}
              </p>
            )}
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* Services & Prices */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 tracking-wide mb-3">
            {t.servicesHeading}
          </h3>
          {business.services.length === 0 ? (
            <p className="text-sm text-slate-500">{t.noServicesEmpty}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {business.services.map((srv) => (
                <div key={srv.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[#101D35]">
                      {srv.name}
                    </span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#7D611F] whitespace-nowrap shrink-0">
                      {formatRwf(srv.priceRwf)}
                    </span>
                  </div>
                  {(srv.durationOrUnit || srv.description) && (
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      {srv.durationOrUnit ? `${srv.durationOrUnit}` : ''}
                      {srv.durationOrUnit && srv.description ? ' · ' : ''}
                      {srv.description || ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <hr className="border-slate-100" />

        {/* Opening Hours */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 tracking-wide mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#7D611F]" aria-hidden="true" />
            <span>{t.hoursHeading}</span>
          </h3>
          <div className="divide-y divide-slate-100 text-xs">
            {business.hours.map((row) => (
              <div
                key={row.day}
                className="py-1.5 flex items-center justify-between gap-3"
              >
                <span className="text-slate-600">{t.days[row.day]}</span>
                {row.closed ? (
                  <span className="text-slate-400 font-medium">{t.closedLabel}</span>
                ) : (
                  <span className="font-mono tabular-nums text-[#101D35] font-medium">
                    {row.open} – {row.close}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
};
