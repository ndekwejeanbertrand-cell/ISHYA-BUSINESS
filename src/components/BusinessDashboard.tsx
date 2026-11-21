import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Plus,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  MessageCircle,
  Send,
  Globe,
} from 'lucide-react';
import type {
  BusinessProfile,
  DayHours,
  Language,
  ServiceItem,
  WhatsAppIntegrationConfig,
  WhatsAppStatusResponse,
} from '../types';
import { TRANSLATIONS } from '../i18n';
import {
  createOwnerBusiness,
  deleteOwnerBusiness,
  getWhatsAppIntegration,
  saveWhatsAppIntegration,
  updateOwnerBusiness,
} from '../services/firestoreBusinesses';
import { formatUserFriendlyError } from '../utils/errorFormat';
import { CategorySelect } from './CategorySelect';
import { CountrySelect } from './CountrySelect';
import { CitySelect } from './CitySelect';
import { AppointmentManager } from './AppointmentManager';

interface BusinessDashboardProps {
  user: User | null;
  authLoading: boolean;
  authError?: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  ownedBusinesses: BusinessProfile[];
  selectedOwnedBusiness: BusinessProfile | null;
  language: Language;
  onSelectOwnedBusiness: (businessId: string) => void;
  onBusinessPublishedOrCreated: (businessId: string) => void;
  idToken: string | null;
  openCreateInitially?: boolean;
  onConsumeOpenCreate?: () => void;
}

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({
  user,
  authLoading,
  authError,
  onSignIn,
  onSignOut,
  ownedBusinesses,
  selectedOwnedBusiness,
  language,
  onSelectOwnedBusiness,
  onBusinessPublishedOrCreated,
  idToken,
  openCreateInitially,
  onConsumeOpenCreate,
}) => {
  const t = TRANSLATIONS[language];

  const [draft, setDraft] = useState<BusinessProfile | null>(selectedOwnedBusiness);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Create new business state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('RW');
  const [newCountryName, setNewCountryName] = useState('Rwanda');
  const [newCity, setNewCity] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // Phase 4: WhatsApp Cloud API integration & Dry-Run simulator state
  const [waStatus, setWaStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [waConfig, setWaConfig] = useState<WhatsAppIntegrationConfig | null>(null);
  const [waSaving, setWaSaving] = useState(false);
  const [waSavedMsg, setWaSavedMsg] = useState<string | null>(null);
  const [simInput, setSimInput] = useState('');
  const [simRunning, setSimRunning] = useState(false);
  const [simOutput, setSimOutput] = useState<{
    reply: string;
    needsHumanAssistance: boolean;
    detectedLanguage: string;
    cloudApiConfigured: boolean;
  } | null>(null);

  useEffect(() => {
    setDraft(selectedOwnedBusiness ? structuredClone(selectedOwnedBusiness) : null);
    setSaveMessage(null);
    setErrorMessage(null);
    setConfirmDelete(false);
    setSimOutput(null);
    setWaSavedMsg(null);
  }, [selectedOwnedBusiness]);

  useEffect(() => {
    if (user && openCreateInitially) {
      setIsCreating(true);
      onConsumeOpenCreate?.();
    }
  }, [user, openCreateInitially, onConsumeOpenCreate]);

  useEffect(() => {
    fetch('/api/whatsapp/status')
      .then((r) => r.json())
      .then((data) => setWaStatus(data))
      .catch(() => setWaStatus(null));
  }, []);

  useEffect(() => {
    if (!user || !selectedOwnedBusiness) {
      setWaConfig(null);
      return;
    }
    let cancelled = false;
    getWhatsAppIntegration(selectedOwnedBusiness.id, user.uid)
      .then((cfg) => {
        if (!cancelled) setWaConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) {
          setWaConfig({
            businessId: selectedOwnedBusiness.id,
            ownerId: user.uid,
            phoneNumberId: '',
            displayPhoneNumber: selectedOwnedBusiness.whatsappNumber,
            webhookEnabled: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, selectedOwnedBusiness?.id]);

  const handleSignInClick = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      await onSignIn();
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setIsSigningIn(false);
    }
  };

  if (authLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 h-64 animate-pulse" />
    );
  }

  // Phase 3: Unauthenticated Owner Gate
  if (!user) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 text-center">
        <img
          src="/assets/aistudio/premium-minimalist-square-brand-logo-for--ishya---_75f5a4d8.png"
          alt="ISHYA Business logo"
          className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border border-[#D9B96E]/50 shadow-sm"
        />
        <p className="font-display text-sm font-semibold text-[#101D35] tracking-tight">
          {t.brandName}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#7D611F] tracking-wide">
          {t.tagline}
        </p>
        <h1 className="mt-1.5 font-display text-xl sm:text-2xl font-semibold text-[#101D35]">
          {t.authGateTitle}
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {t.authGateSubtitle}
        </p>

        {(errorMessage || authError) && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 text-left bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
            <span>{errorMessage || authError}</span>
          </div>
        )}

        <button
          type="button"
          disabled={isSigningIn}
          onClick={handleSignInClick}
          className="mt-6 min-h-[48px] px-6 py-3 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors border border-[#D9B96E]/50 disabled:opacity-50"
        >
          <LogIn className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
          <span>{isSigningIn ? t.signingInButton : t.signInGoogleButton}</span>
        </button>
      </div>
    );
  }

  const updateField = <K extends keyof BusinessProfile>(
    key: K,
    value: BusinessProfile[K]
  ) => {
    setSaveMessage(null);
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateService = (index: number, patch: Partial<ServiceItem>) => {
    setSaveMessage(null);
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.services];
      next[index] = { ...next[index], ...patch };
      return { ...prev, services: next };
    });
  };

  const addService = () => {
    setSaveMessage(null);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            services: [
              ...prev.services,
              {
                id: `srv-${Date.now()}`,
                name: '',
                priceRwf: 5000,
                durationOrUnit: '',
                description: '',
              },
            ],
          }
        : prev
    );
  };

  const removeService = (index: number) => {
    setSaveMessage(null);
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            services: prev.services.filter((_, i) => i !== index),
          }
        : prev
    );
  };

  const updateHours = (index: number, patch: Partial<DayHours>) => {
    setSaveMessage(null);
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.hours];
      next[index] = { ...next[index], ...patch };
      return { ...prev, hours: next };
    });
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanCategory = newCategory.trim();
    const cleanCountryCode = newCountryCode.trim().toUpperCase();
    const cleanCountryName = newCountryName.trim() || (cleanCountryCode === 'RW' ? 'Rwanda' : cleanCountryCode);
    const cleanCity = newCity.trim();
    if (!cleanName) return;
    if (!cleanCategory) {
      setErrorMessage(t.categoryRequiredError);
      return;
    }
    if (!cleanCountryCode) {
      setErrorMessage(t.countryRequiredError);
      return;
    }
    if (!cleanCity) {
      setErrorMessage(t.cityRequiredError);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createOwnerBusiness(user.uid, {
        name: cleanName,
        category: cleanCategory,
        description: newDescription.trim(),
        address: newAddress.trim(),
        countryCode: cleanCountryCode,
        countryName: cleanCountryName,
        region: '',
        district: '',
        sector: '',
        city: cleanCity,
        phone: newPhone.trim(),
        whatsappNumber: newWhatsapp.trim(),
        email: newEmail.trim(),
        isPublished: true,
      });
      onBusinessPublishedOrCreated(created.id);
      setIsCreating(false);
      setNewName('');
      setNewCategory('');
      setNewDescription('');
      setNewAddress('');
      setNewCountryCode('RW');
      setNewCountryName('Rwanda');
      setNewCity('');
      setNewPhone('');
      setNewWhatsapp('');
      setNewEmail('');
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.category.trim()) {
      setErrorMessage(t.categoryRequiredError);
      return;
    }
    const draftCountryCode = (draft.countryCode ?? 'RW').trim().toUpperCase() || 'RW';
    if (!draft.city.trim()) {
      setErrorMessage(t.cityRequiredError);
      return;
    }
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);
    try {
      await updateOwnerBusiness({
        ...draft,
        countryCode: draftCountryCode,
        countryName: draft.countryName?.trim() || (draftCountryCode === 'RW' ? 'Rwanda' : draftCountryCode),
      });
      setSaveMessage(t.savedToast);
      onBusinessPublishedOrCreated(draft.id);
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await deleteOwnerBusiness(draft.id);
      setConfirmDelete(false);
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!waConfig || !idToken) return;
    setWaSaving(true);
    setWaSavedMsg(null);
    setErrorMessage(null);
    try {
      await saveWhatsAppIntegration(waConfig, idToken);
      setWaSavedMsg(t.waIntegrationSaved);
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setWaSaving(false);
    }
  };

  const handleRunSimulator = async () => {
    if (!draft || !idToken || !simInput.trim()) return;
    setSimRunning(true);
    setErrorMessage(null);
    setSimOutput(null);
    try {
      const res = await fetch('/api/whatsapp/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          businessId: draft.id,
          phoneNumberId: waConfig?.phoneNumberId || '',
          customerMessage: simInput.trim(),
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Simulation failed.');
      }
      setSimOutput({
        reply: data.aiReply.reply,
        needsHumanAssistance: Boolean(data.aiReply.needsHumanAssistance),
        detectedLanguage: data.aiReply.detectedLanguage,
        cloudApiConfigured: Boolean(data.cloudApiConfigured),
      });
    } catch (err) {
      setErrorMessage(formatUserFriendlyError(err, language));
    } finally {
      setSimRunning(false);
    }
  };

  const webhookCallbackUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '/api/whatsapp/webhook';

  return (
    <div className="space-y-6">
      {/* Owner Account & Workspace Selector */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <img
              src="/assets/aistudio/premium-minimalist-square-brand-logo-for--ishya---_75f5a4d8.png"
              alt="ISHYA Business logo"
              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-[#D9B96E]/45 mt-0.5"
            />
            <div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                <span className="font-display font-semibold text-[#101D35]">
                  {t.brandName}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-medium text-[#7D611F]">
                  {t.tagline}
                </span>
              </div>
            <p className="mt-1.5 text-xs font-medium text-[#7D611F]">
              {t.signedInAsLabel}: {user.displayName || user.email} ({user.email})
            </p>
            <h1 className="mt-1 font-display text-xl sm:text-2xl font-semibold text-[#101D35]">
              {t.dashboardTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-600">{t.dashboardSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsCreating((prev) => !prev)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
              <span>{t.newBusinessButton}</span>
            </button>

            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-[#101D35] hover:bg-[#E9EEF5]/60 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.signOutButton}</span>
            </button>
          </div>
        </div>

        {ownedBusinesses.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            {ownedBusinesses.map((biz) => {
              const active = selectedOwnedBusiness?.id === biz.id;
              return (
                <button
                  key={biz.id}
                  type="button"
                  onClick={() => onSelectOwnedBusiness(biz.id)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-[#101D35] text-white border-[#101D35]'
                      : 'bg-[#E9EEF5]/70 text-[#101D35] border-slate-200 hover:border-[#D9B96E]'
                  }`}
                >
                  {biz.name}
                  {biz.isPublished ? '' : ` · ${t.draftStatusLabel}`}
                </button>
              );
            })}
          </div>
        )}

        {isCreating && (
          <form
            onSubmit={handleCreateBusiness}
            className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <div className="sm:col-span-2 lg:col-span-3">
              <h2 className="font-display text-sm font-semibold text-[#101D35]">
                {t.createBusinessTitle}
              </h2>
            </div>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`${t.businessNameLabel} *`}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <CategorySelect
              value={newCategory}
              onChange={setNewCategory}
              language={language}
              required
              placeholderSuffix=" *"
            />
            <CountrySelect
              countryCode={newCountryCode}
              countryName={newCountryName}
              onChange={(country) => {
                setNewCountryCode(country.code);
                setNewCountryName(country.nameEn);
                setNewCity('');
              }}
              language={language}
              required
              placeholderSuffix=" *"
            />
            <CitySelect
              countryCode={newCountryCode}
              value={newCity}
              onChange={setNewCity}
              language={language}
              disabled={!newCountryCode}
              required
              placeholderSuffix=" *"
            />
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder={t.addressLabel}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <input
              type="text"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder={t.phoneLabel}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <input
              type="text"
              value={newWhatsapp}
              onChange={(e) => setNewWhatsapp(e.target.value)}
              placeholder={`${t.whatsappLabel} (+250...)`}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t.emailLabel}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <textarea
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder={t.descriptionLabel}
              className="sm:col-span-2 lg:col-span-3 px-3.5 py-2.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
            />
            <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={
                  !newName.trim() ||
                  !newCategory.trim() ||
                  !newCountryCode.trim() ||
                  !newCity.trim() ||
                  isSaving
                }
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                {t.createBusinessSubmit}
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-[#E9EEF5]/60 text-sm font-medium transition-colors"
              >
                {t.cancelButton}
              </button>
            </div>
          </form>
        )}
      </div>

      {saveMessage && (
        <div
          role="status"
          className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-3 text-sm"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{saveMessage}</span>
        </div>
      )}

      {(errorMessage || authError) && (
        <div
          role="alert"
          className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm"
        >
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
          <span>{errorMessage || authError}</span>
        </div>
      )}

      {!draft ? (
        !isCreating && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center">
            <h2 className="font-display text-lg font-semibold text-[#101D35]">
              {t.noBusinessAddedTitle}
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto">
              {t.noOwnedBusinessesYet}
            </p>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="mt-5 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors border border-[#D9B96E]/50"
            >
              <Plus className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
              <span>{t.addFirstBusinessButton}</span>
            </button>
          </div>
        )
      ) : (
        <>
          <AppointmentManager businessId={draft.id} idToken={idToken} language={language} />
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-base font-semibold text-[#101D35]">
                    {t.sectionIdentity}
                  </h2>
                  <span className="text-xs font-medium text-[#7D611F] inline-flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                    {draft.isPublished ? t.publishedStatusLabel : t.draftStatusLabel}
                  </span>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.isPublished)}
                    onChange={(e) => updateField('isPublished', e.target.checked)}
                    className="mt-1 w-4 h-4 accent-[#101D35]"
                  />
                  <div>
                    <span className="block text-sm font-medium text-[#101D35]">
                      {t.publishedLabel}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {t.publishedHelp}
                    </span>
                  </div>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">
                      {t.businessNameLabel}
                    </span>
                    <input
                      type="text"
                      required
                      value={draft.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>

                  <div className="block sm:col-span-2">
                    <span className="block text-xs font-medium text-slate-600 mb-1.5">
                      {t.categoryLabel} *
                    </span>
                    <CategorySelect
                      key={draft.id}
                      value={draft.category}
                      onChange={(val) => updateField('category', val)}
                      language={language}
                      required
                    />
                  </div>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">
                      {t.descriptionLabel}
                    </span>
                    <textarea
                      rows={3}
                      value={draft.description}
                      onChange={(e) => updateField('description', e.target.value)}
                      className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">
                      {t.addressLabel}
                    </span>
                    <input
                      type="text"
                      value={draft.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>

                  <div className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-1.5">
                      {t.countryLabel} *
                    </span>
                    <CountrySelect
                      countryCode={(draft.countryCode ?? 'RW').trim() || 'RW'}
                      countryName={draft.countryName}
                      onChange={(country) => {
                        setSaveMessage(null);
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                countryCode: country.code,
                                countryName: country.nameEn,
                                region: '',
                                district: '',
                                sector: '',
                                city: '',
                              }
                            : prev
                        );
                      }}
                      language={language}
                      required
                    />
                  </div>

                  <div className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-1.5">
                      {t.cityLabel} *
                    </span>
                    <CitySelect
                      countryCode={(draft.countryCode ?? 'RW').trim().toUpperCase() || 'RW'}
                      value={draft.city}
                      onChange={(city) => updateField('city', city)}
                      language={language}
                      required
                    />
                  </div>
                </div>
              </section>

              <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-4">
                <h2 className="font-display text-base font-semibold text-[#101D35]">
                  {t.sectionContact}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      {t.phoneLabel}
                    </span>
                    <input
                      type="text"
                      value={draft.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      {t.whatsappLabel}
                    </span>
                    <input
                      type="text"
                      value={draft.whatsappNumber}
                      onChange={(e) => updateField('whatsappNumber', e.target.value)}
                      placeholder="+250..."
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>
                  <p className="sm:col-span-2 text-xs text-slate-500 -mt-2">
                    {t.whatsappHelp}
                  </p>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">
                      {t.emailLabel}
                    </span>
                    <input
                      type="email"
                      value={draft.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-medium text-slate-600">
                      {t.handoffNoteLabel}
                    </span>
                    <textarea
                      rows={3}
                      value={draft.humanHandoffNote}
                      onChange={(e) => updateField('humanHandoffNote', e.target.value)}
                      className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                    />
                  </label>
                </div>
              </section>
            </div>

            <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-display text-base font-semibold text-[#101D35]">
                  {t.sectionServices}
                </h2>
                <button
                  type="button"
                  onClick={addService}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/70 hover:bg-[#FBF7EC] border border-slate-200 hover:border-[#D9B96E] text-xs font-medium text-[#101D35] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-4 h-4 text-[#7D611F]" aria-hidden="true" />
                  <span>{t.addServiceButton}</span>
                </button>
              </div>

              {draft.services.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">{t.noServicesEmpty}</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {draft.services.map((srv, index) => (
                    <div
                      key={srv.id}
                      className="py-4 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-12 gap-3 items-start"
                    >
                      <div className="md:col-span-4">
                        <input
                          type="text"
                          value={srv.name}
                          onChange={(e) => updateService(index, { name: e.target.value })}
                          placeholder={t.serviceNamePlaceholder}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={srv.priceRwf}
                          onChange={(e) =>
                            updateService(index, {
                              priceRwf: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          aria-label={t.servicePriceLabel}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono tabular-nums text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={srv.durationOrUnit}
                          onChange={(e) =>
                            updateService(index, { durationOrUnit: e.target.value })
                          }
                          placeholder={t.serviceDurationPlaceholder}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <input
                          type="text"
                          value={srv.description}
                          onChange={(e) =>
                            updateService(index, { description: e.target.value })
                          }
                          placeholder={t.serviceDescPlaceholder}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                        />
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeService(index)}
                          aria-label={t.removeService}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6">
              <h2 className="font-display text-base font-semibold text-[#101D35] mb-4">
                {t.sectionHours}
              </h2>
              <div className="divide-y divide-slate-100">
                {draft.hours.map((row, index) => (
                  <div
                    key={row.day}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <span className="text-sm font-medium text-[#101D35] w-32">
                      {t.days[row.day]}
                    </span>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 min-h-[44px] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={row.closed}
                          onChange={(e) => updateHours(index, { closed: e.target.checked })}
                          className="w-4 h-4 accent-[#101D35] rounded"
                        />
                        <span className="text-xs font-medium text-slate-600">
                          {t.closedLabel}
                        </span>
                      </label>

                      {!row.closed && (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={row.open}
                            aria-label={`${t.days[row.day]} ${t.openLabel}`}
                            onChange={(e) => updateHours(index, { open: e.target.value })}
                            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono tabular-nums text-xs text-[#101D35]"
                          />
                          <span className="text-slate-400 text-xs">–</span>
                          <input
                            type="time"
                            value={row.close}
                            aria-label={`${t.days[row.day]} ${t.closeLabel}`}
                            onChange={(e) => updateHours(index, { close: e.target.value })}
                            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono tabular-nums text-xs text-[#101D35]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleDelete}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-700 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>
                  {confirmDelete ? t.confirmDeleteText : t.deleteBusinessButton}
                </span>
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors border border-[#D9B96E]/50 disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
                <span>{isSaving ? t.savingChanges : t.saveChanges}</span>
              </button>
            </div>
          </form>

          {/* Phase 4: WhatsApp Cloud API Integration & Webhook Dry-Run */}
          <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#7D611F]" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold text-[#101D35]">
                  {t.sectionWhatsAppApi}
                </h2>
              </div>
              <span className="text-xs font-medium text-slate-600">
                {waStatus?.cloudApiConfigured
                  ? t.waApiStatusConnected
                  : t.waApiStatusNotConfigured}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-medium text-slate-600">
                    {t.waWebhookUrlLabel}
                  </span>
                  <div className="mt-1.5 px-3.5 py-2.5 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-xs text-[#101D35] break-all">
                    {webhookCallbackUrl}
                  </div>
                </div>

                {waConfig && (
                  <>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        {t.waPhoneNumberIdLabel}
                      </span>
                      <input
                        type="text"
                        value={waConfig.phoneNumberId}
                        onChange={(e) =>
                          setWaConfig({ ...waConfig, phoneNumberId: e.target.value })
                        }
                        placeholder={t.waPhoneNumberIdLabel}
                        className="mt-1.5 w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[#E9EEF5]/60 border border-slate-200 font-mono text-sm text-[#101D35] focus:outline-none focus:border-[#101D35]"
                      />
                      <span className="mt-1 block text-xs text-slate-500">
                        {t.waPhoneNumberIdHelp}
                      </span>
                    </label>

                    <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={waConfig.webhookEnabled}
                        onChange={(e) =>
                          setWaConfig({ ...waConfig, webhookEnabled: e.target.checked })
                        }
                        className="w-4 h-4 accent-[#101D35]"
                      />
                      <span className="text-sm text-[#101D35]">
                        {t.waWebhookEnabledLabel}
                      </span>
                    </label>

                    <div>
                      <button
                        type="button"
                        disabled={waSaving}
                        onClick={handleSaveWhatsApp}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-40"
                      >
                        <Save className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
                        <span>{t.waSaveIntegrationButton}</span>
                      </button>
                      {waSavedMsg && (
                        <p className="mt-2 text-xs text-emerald-700 font-medium">
                          {waSavedMsg}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="bg-[#E9EEF5]/65 border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="font-display text-sm font-semibold text-[#101D35]">
                  {t.waSimulatorTitle}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t.waSimulatorNote}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={simInput}
                    onChange={(e) => setSimInput(e.target.value)}
                    placeholder={t.waSimulatorPlaceholder}
                    className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-[#101D35]"
                  />
                  <button
                    type="button"
                    disabled={simRunning || !simInput.trim()}
                    onClick={handleRunSimulator}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5 text-[#D9B96E]" aria-hidden="true" />
                    <span>{simRunning ? t.waSimulatorRunning : t.waSimulatorRunButton}</span>
                  </button>
                </div>

                {simOutput && (
                  <div className="mt-3 p-3.5 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5">
                    <p className="font-medium text-slate-500">
                      {simOutput.detectedLanguage.toUpperCase()} ·{' '}
                      {simOutput.needsHumanAssistance
                        ? t.waPreviewHumanHandoff
                        : t.waPreviewVerifiedReply}
                    </p>
                    <p className="text-sm text-[#101D35] whitespace-pre-wrap leading-relaxed">
                      {simOutput.reply}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
