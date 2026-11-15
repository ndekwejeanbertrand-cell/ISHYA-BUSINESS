import { useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  MessageSquare,
  Store,
  SlidersHorizontal,
  AlertCircle,
  Plus,
} from 'lucide-react';
import type { BusinessProfile, ChatMessage, Language } from './types';
import { TRANSLATIONS } from './i18n';
import { auth, googleProvider } from './firebase';
import {
  ensureOwnerProfile,
  subscribeOwnerBusinesses,
} from './services/firestoreBusinesses';
import { CustomerChat } from './components/CustomerChat';
import { BusinessInfoPanel } from './components/BusinessInfoPanel';
import { BusinessDashboard } from './components/BusinessDashboard';
import { formatUserFriendlyError } from './utils/errorFormat';
import { getCategoryLabel } from './constants/categories';

type ActiveTab = 'chat' | 'info' | 'dashboard';

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'rw', label: 'RW' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
];

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');

  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [publicBusinesses, setPublicBusinesses] = useState<BusinessProfile[]>([]);
  const [ownedBusinesses, setOwnedBusinesses] = useState<BusinessProfile[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string>('');
  const [selectedOwnedId, setSelectedOwnedId] = useState<string>('');
  const [loadingPublic, setLoadingPublic] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [openCreateOnDashboard, setOpenCreateOnDashboard] = useState(false);

  const [chatByBusiness, setChatByBusiness] = useState<
    Record<string, ChatMessage[]>
  >({});

  const t = TRANSLATIONS[language];

  // Refresh public storefronts from Cloud Firestore
  const fetchPublicBusinesses = async () => {
    try {
      const res = await fetch('/api/public-businesses');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load businesses.');
      }
      const list: BusinessProfile[] = data.businesses ?? [];
      setPublicBusinesses(list);
      setActiveBusinessId((prev) =>
        prev ? prev : list[0]?.id ?? ''
      );
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : t.errorLoadBusinesses
      );
    } finally {
      setLoadingPublic(false);
    }
  };

  useEffect(() => {
    void fetchPublicBusinesses();
  }, []);

  // Auth listener (Phase 3)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const token = await nextUser.getIdToken();
          setIdToken(token);
          await ensureOwnerProfile(nextUser, language);
          setAuthError(null);
        } catch (err) {
          console.error('Owner profile sync error:', err);
          setAuthError(formatUserFriendlyError(err, language));
        }
      } else {
        setIdToken(null);
        setAuthError(null);
        setOwnedBusinesses([]);
        setSelectedOwnedId('');
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Strict owner-scoped Firestore subscription (Phases 2 & 3)
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeOwnerBusinesses(
      user.uid,
      (list) => {
        setOwnedBusinesses(list);
        setSelectedOwnedId((prev) =>
          prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? ''
        );
      },
      (err) => {
        setAuthError(formatUserFriendlyError(err, language));
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const handleSignIn = async () => {
    setAuthError(null);
    const cred = await signInWithPopup(auth, googleProvider);
    const token = await cred.user.getIdToken();
    setIdToken(token);
    await ensureOwnerProfile(cred.user, language);
    setAuthError(null);
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  // Merge owned businesses + published storefronts without duplicates for the Customer Chat switcher
  const chatAvailableBusinesses = useMemo(() => {
    const byId = new Map<string, BusinessProfile>();
    for (const biz of ownedBusinesses) {
      byId.set(biz.id, biz);
    }
    for (const pub of publicBusinesses) {
      if (!byId.has(pub.id)) {
        byId.set(pub.id, pub);
      }
    }
    return Array.from(byId.values());
  }, [ownedBusinesses, publicBusinesses]);

  const activeBusiness = useMemo(
    () =>
      chatAvailableBusinesses.find((b) => b.id === activeBusinessId) ??
      chatAvailableBusinesses[0] ??
      null,
    [chatAvailableBusinesses, activeBusinessId]
  );

  const selectedOwnedBusiness = useMemo(
    () =>
      ownedBusinesses.find((b) => b.id === selectedOwnedId) ??
      ownedBusinesses[0] ??
      null,
    [ownedBusinesses, selectedOwnedId]
  );

  const activeMessages = activeBusiness
    ? chatByBusiness[activeBusiness.id] ?? []
    : [];

  const setActiveMessages: React.Dispatch<
    React.SetStateAction<ChatMessage[]>
  > = (updater) => {
    if (!activeBusiness) return;
    const id = activeBusiness.id;
    setChatByBusiness((prev) => {
      const current = prev[id] ?? [];
      const next =
        typeof updater === 'function' ? updater(current) : updater;
      return { ...prev, [id]: next };
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#E9EEF5] text-[#101D35]">
      <header className="sticky top-0 z-30 h-14 sm:h-16 bg-[#101D35] text-white border-b border-[#1D3158]">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B96E]"
          >
            <img
              src="/assets/aistudio/premium-minimalist-square-brand-logo-for--ishya---_75f5a4d8.png"
              alt="ISHYA Business logo"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg object-cover shrink-0 border border-[#D9B96E]/35"
            />
            <span className="flex flex-col leading-tight">
              <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-white">
                {t.brandName}
              </span>
              <span className="hidden sm:block text-[11px] font-medium text-[#D9B96E] tracking-tight">
                {t.tagline}
              </span>
            </span>
          </button>

          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`min-h-[44px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeTab === 'chat' || activeTab === 'info'
                  ? 'border-[#D9B96E] text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              {t.navChat}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`min-h-[44px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-[#D9B96E] text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              {t.navDashboard}
            </button>
          </nav>

          <div
            role="group"
            aria-label={t.languageLabel}
            className="flex items-center gap-1 p-1 rounded-xl bg-[#182A4D] border border-[#243B68] shrink-0"
          >
            {LANGUAGES.map((lang) => {
              const selected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => setLanguage(lang.code)}
                  className={`min-h-[34px] min-w-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-[#D9B96E] text-[#101D35]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {lang.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 md:pb-8">
        {loadingPublic ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 h-[480px] rounded-2xl bg-white border border-slate-200 animate-pulse" />
            <div className="lg:col-span-4 h-[480px] rounded-2xl bg-white border border-slate-200 animate-pulse" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-900 rounded-2xl p-5 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
        ) : activeTab === 'dashboard' ? (
          <BusinessDashboard
            user={user}
            authLoading={authLoading}
            authError={authError}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
            ownedBusinesses={ownedBusinesses}
            selectedOwnedBusiness={selectedOwnedBusiness}
            language={language}
            onSelectOwnedBusiness={(id) => setSelectedOwnedId(id)}
            onBusinessPublishedOrCreated={(id) => {
              setSelectedOwnedId(id);
              setActiveBusinessId(id);
              void fetchPublicBusinesses();
            }}
            idToken={idToken}
            openCreateInitially={openCreateOnDashboard}
            onConsumeOpenCreate={() => setOpenCreateOnDashboard(false)}
          />
        ) : activeBusiness ? (
          <>
            <div className="mb-4 sm:mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2.5 text-xs text-slate-600">
                <span className="font-medium text-[#101D35] whitespace-nowrap">
                  {t.activeBusinessLabel}:
                </span>
                <span className="truncate">
                  {getCategoryLabel(activeBusiness.category, language)}
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">
                {chatAvailableBusinesses.map((biz) => {
                  const selected = biz.id === activeBusiness.id;
                  return (
                    <button
                      key={biz.id}
                      type="button"
                      onClick={() => setActiveBusinessId(biz.id)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors border ${
                        selected
                          ? 'bg-[#101D35] text-white border-[#101D35]'
                          : 'bg-[#E9EEF5]/70 text-[#101D35] border-slate-200 hover:border-[#D9B96E]'
                      }`}
                    >
                      {biz.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div
                className={`lg:col-span-8 ${
                  activeTab === 'info' ? 'hidden lg:block' : 'block'
                }`}
              >
                <CustomerChat
                  business={activeBusiness}
                  language={language}
                  messages={activeMessages}
                  onMessagesChange={setActiveMessages}
                  idToken={idToken}
                />
              </div>

              <div
                className={`lg:col-span-4 ${
                  activeTab === 'info' ? 'block' : 'hidden lg:block'
                }`}
              >
                <BusinessInfoPanel
                  business={activeBusiness}
                  language={language}
                />
              </div>
            </div>
          </>
        ) : (
          <section className="max-w-xl mx-auto mt-4 sm:mt-8 bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-10 text-center">
            <img
              src="/assets/aistudio/premium-minimalist-square-brand-logo-for--ishya---_75f5a4d8.png"
              alt="ISHYA Business logo"
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-5 border border-[#D9B96E]/50 shadow-sm"
            />
            <p className="font-display text-xs font-semibold text-[#7D611F] tracking-wide">
              {t.brandName} · {t.tagline}
            </p>
            <h1 className="mt-2 font-display text-xl sm:text-2xl font-semibold text-[#101D35]">
              {t.noBusinessAddedTitle}
            </h1>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
              {t.noBusinessAddedBody}
            </p>
            <button
              type="button"
              onClick={() => {
                setOpenCreateOnDashboard(true);
                setActiveTab('dashboard');
              }}
              className="mt-6 min-h-[48px] px-6 py-3 rounded-xl bg-[#101D35] hover:bg-[#182A4D] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors border border-[#D9B96E]/50"
            >
              <Plus className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
              <span>{t.addFirstBusinessButton}</span>
            </button>
          </section>
        )}
      </main>

      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-3 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] text-[11px] font-medium transition-colors ${
              activeTab === 'chat'
                ? 'text-[#101D35]'
                : 'text-slate-500 hover:text-[#101D35]'
            }`}
          >
            <MessageSquare
              className={`w-5 h-5 ${
                activeTab === 'chat' ? 'text-[#7D611F]' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>{t.navChat}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] text-[11px] font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-[#101D35]'
                : 'text-slate-500 hover:text-[#101D35]'
            }`}
          >
            <Store
              className={`w-5 h-5 ${
                activeTab === 'info' ? 'text-[#7D611F]' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>{t.navInfo}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center gap-1 min-h-[44px] text-[11px] font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'text-[#101D35]'
                : 'text-slate-500 hover:text-[#101D35]'
            }`}
          >
            <SlidersHorizontal
              className={`w-5 h-5 ${
                activeTab === 'dashboard' ? 'text-[#7D611F]' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>{t.navDashboard}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
