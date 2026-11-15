import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  RotateCcw,
  MessageCircle,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import type { BusinessProfile, ChatMessage, Language } from '../types';
import { TRANSLATIONS } from '../i18n';
import { buildWhatsappUrl } from '../utils/whatsapp';

interface CustomerChatProps {
  business: BusinessProfile;
  language: Language;
  messages: ChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  idToken?: string | null;
}

export const CustomerChat: React.FC<CustomerChatProps> = ({
  business,
  language,
  messages,
  onMessagesChange,
  idToken,
}) => {
  const t = TRANSLATIONS[language];
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSending) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    onMessagesChange(nextHistory);
    setInput('');
    setIsSending(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          businessId: business.id,
          language,
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || t.errorChatFailed);
      }

      const assistantMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        needsHumanAssistance: Boolean(data.needsHumanAssistance),
        detectedLanguage: data.detectedLanguage,
        timestamp: new Date().toISOString(),
      };
      onMessagesChange([...nextHistory, assistantMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.errorChatFailed);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleReset = () => {
    setError(null);
    onMessagesChange([]);
  };

  const whatsappUrl = buildWhatsappUrl(business, language);

  return (
    <div className="flex flex-col bg-white border border-slate-200/90 rounded-2xl overflow-hidden min-h-[540px] lg:h-[calc(100vh-11.5rem)]">
      <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-[#7D611F] shrink-0" aria-hidden="true" />
            <span className="truncate">
              {business.isPublished === false
                ? `${business.category} · ${t.draftStatusLabel}`
                : business.category}
              {business.district ? ` · ${business.district}` : ''}
            </span>
          </div>
          <h2 className="font-display text-base sm:text-lg font-semibold text-[#101D35] truncate mt-0.5">
            {business.name}
          </h2>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={messages.length === 0 && !error}
          className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-[#101D35] hover:bg-[#E9EEF5] disabled:opacity-40 disabled:pointer-events-none transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t.clearChat}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4 bg-[#E9EEF5]">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-100">
            <img
              src="/assets/aistudio/premium-minimalist-square-brand-logo-for--ishya---_75f5a4d8.png"
              alt="ISHYA Business logo"
              className="w-10 h-10 rounded-xl object-cover shrink-0 border border-[#D9B96E]/40"
            />
            <div className="min-w-0">
              <p className="font-display text-xs font-semibold text-[#101D35] leading-tight">
                {t.brandName}
              </p>
              <p className="text-[11px] text-[#7D611F] font-medium leading-tight">
                {t.tagline}
              </p>
            </div>
          </div>

          <h3 className="font-display text-sm sm:text-base font-semibold text-[#101D35]">
            {t.chatWelcomeTitle}
          </h3>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
            {t.chatWelcomeBody}
          </p>

          <div className="mt-4 pt-3.5 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2.5">
              {t.quickPromptsLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              {t.quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isSending}
                  onClick={() => void sendMessage(prompt)}
                  className="min-h-[44px] text-left px-3.5 py-2 rounded-xl bg-[#E9EEF5]/70 hover:bg-[#FBF7EC] border border-slate-200 hover:border-[#D9B96E] text-xs sm:text-sm text-[#101D35] transition-colors disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-[#101D35] text-white'
                    : 'bg-white border border-slate-200/90 text-[#101D35]'
                }`}
              >
                {msg.text}
              </div>

              {!isUser && msg.needsHumanAssistance && (
                <div className="mt-2 max-w-[88%] sm:max-w-[78%] bg-[#FBF7EC] border border-[#D9B96E]/60 rounded-xl p-3.5 text-xs text-[#101D35]">
                  <p className="font-semibold text-[#101D35]">{t.humanAssistTitle}</p>
                  <p className="mt-1 text-slate-700 leading-relaxed">
                    {business.humanHandoffNote || t.humanAssistDesc}
                  </p>
                  {whatsappUrl ? (
                    <div className="mt-2.5">
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#101D35] hover:bg-[#182A4D] text-white text-xs font-medium transition-colors"
                      >
                        <MessageCircle className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
                        <span>{t.whatsappButton}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                      </a>
                      <p className="mt-1.5 text-[11px] text-slate-600">
                        {t.whatsappDisclaimer}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-slate-600">{t.noWhatsappConfigured}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-start">
            <div className="bg-white border border-slate-200/90 rounded-2xl px-4 py-3 text-sm text-slate-500">
              {t.sendingButton}
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-3 sm:p-4 bg-white border-t border-slate-200/80"
      >
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.chatPlaceholder}
            aria-label={t.chatPlaceholder}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#E9EEF5]/65 border border-slate-200 text-sm text-[#101D35] placeholder:text-slate-400 focus:outline-none focus:border-[#101D35] focus:ring-1 focus:ring-[#101D35]"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-xl bg-[#101D35] hover:bg-[#182A4D] disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4 text-[#D9B96E]" aria-hidden="true" />
            <span className="hidden sm:inline">{t.sendButton}</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t.privacyNote}</p>
      </form>
    </div>
  );
};
