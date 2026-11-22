import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, LockKeyhole } from 'lucide-react';
import type { Appointment, InAppNotification, Language, ServiceItem } from '../types';

interface AppointmentBookingFormProps {
  businessId: string;
  services: ServiceItem[];
  idToken: string | null;
  emailVerified: boolean;
  customerName: string;
  customerEmail: string;
  language: Language;
  onSignIn: () => void;
}

const text = {
  rw: {
    title: 'Saba rendez-vous',
    intro: 'Hitamo serivisi n’igihe wifuza. Ubusabe bwawe buzabanza kwemezwa na nyir’ubucuruzi.',
    signIn: 'Injira kugira ngo usabe rendez-vous',
    signInNote: 'Ugomba kuba winjiye ukoresheje konti ifite imeyili yemejwe.',
    service: 'Serivisi',
    chooseService: 'Hitamo serivisi',
    date: 'Itariki n’isaha',
    name: 'Amazina yawe',
    phone: 'Telefoni (urugero: +2507...)',
    email: 'Imeyili',
    note: 'Icyo wifuza kumenyesha (si ngombwa)',
    channels: 'Uburyo bwo kukwibutsa (igihe buzaba bwashyizweho)',
    app: 'Muri ISHYA',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    submit: 'Ohereza ubusabe',
    sending: 'Birimo koherezwa...',
    success: 'Ubusabe bwawe bwoherejwe. Tegereza ko nyir’ubucuruzi abwemeza.',
    error: 'Ntibyashobotse kohereza ubusabe.',
    durationMissing: 'Iyi serivisi ntirashyirirwaho igihe nyacyo. Nyir’ubucuruzi agomba kugishyiraho mbere yo kwakira ubusabe.',
    duration: 'Igihe',
    minutes: 'iminota',
    required: 'Uzuza ibisabwa byose.',
    past: 'Hitamo igihe kiri imbere.',
    myRequests: 'Aho wasabye rendez-vous',
    noRequests: 'Nta busabe urasaba.',
    statusPending: 'Itegereje kwemezwa',
    statusConfirmed: 'Yemejwe',
    statusDeclined: 'Yanzwe',
    statusCancelled: 'Yahagaritswe',
    statusCompleted: 'Yarangiye',
    statusNoShow: 'Ntiyitabiriye',
    notifications: 'Ubutumwa bukumenyesha',
    noNotifications: 'Nta butumwa bushya burahari.',
    markRead: 'Shyira mu byasomwe',
  },
  en: {
    title: 'Request an appointment',
    intro: 'Choose a service and preferred time. The business owner must approve your request.',
    signIn: 'Sign in to request an appointment',
    signInNote: 'You must sign in with a verified email account.',
    service: 'Service',
    chooseService: 'Choose a service',
    date: 'Date and time',
    name: 'Your full name',
    phone: 'Phone (e.g. +2507...)',
    email: 'Email',
    note: 'Additional note (optional)',
    channels: 'Reminder preferences (when reminders are enabled)',
    app: 'In ISHYA',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    submit: 'Send request',
    sending: 'Sending...',
    success: 'Your request was sent. Wait for the business owner to approve it.',
    error: 'Could not send your request.',
    durationMissing: 'This service has no supported duration yet. Ask the business owner to configure it before booking.',
    duration: 'Duration',
    minutes: 'minutes',
    required: 'Complete all required fields.',
    past: 'Choose a future time.',
    myRequests: 'Your appointment requests',
    noRequests: 'You have not requested any appointments yet.',
    statusPending: 'Pending',
    statusConfirmed: 'Confirmed',
    statusDeclined: 'Declined',
    statusCancelled: 'Cancelled',
    statusCompleted: 'Completed',
    statusNoShow: 'No-show',
    notifications: 'Notifications',
    noNotifications: 'No new notifications.',
    markRead: 'Mark as read',
  },
  fr: {
    title: 'Demander un rendez-vous',
    intro: 'Choisissez un service et un horaire. Le propriétaire doit confirmer votre demande.',
    signIn: 'Connectez-vous pour demander un rendez-vous',
    signInNote: 'Vous devez utiliser un compte avec une adresse e-mail vérifiée.',
    service: 'Service',
    chooseService: 'Choisir un service',
    date: 'Date et heure',
    name: 'Nom complet',
    phone: 'Téléphone (ex. +2507...)',
    email: 'E-mail',
    note: 'Note complémentaire (facultatif)',
    channels: 'Préférences de rappel (lorsque les rappels seront activés)',
    app: 'Dans ISHYA',
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    submit: 'Envoyer la demande',
    sending: 'Envoi...',
    success: 'Votre demande a été envoyée. Attendez la confirmation du propriétaire.',
    error: 'Impossible d’envoyer la demande.',
    durationMissing: 'La durée de ce service n’est pas encore configurée. Le propriétaire doit la définir.',
    duration: 'Durée',
    minutes: 'minutes',
    required: 'Veuillez remplir les champs obligatoires.',
    past: 'Choisissez une heure future.',
    myRequests: 'Vos demandes de rendez-vous',
    noRequests: 'Vous n’avez encore demandé aucun rendez-vous.',
    statusPending: 'En attente',
    statusConfirmed: 'Confirmé',
    statusDeclined: 'Refusé',
    statusCancelled: 'Annulé',
    statusCompleted: 'Terminé',
    statusNoShow: 'Absent',
    notifications: 'Notifications',
    noNotifications: 'Aucune nouvelle notification.',
    markRead: 'Marquer comme lu',
  },
} as const;

function durationMinutes(value: string): number | null {
  const v = value.trim().toLowerCase();
  const m = v.match(/^(\d{1,4})\s*(m|min|mins|minute|minutes)$/);
  if (m) return Number(m[1]) > 0 && Number(m[1]) <= 1440 ? Number(m[1]) : null;
  const h = v.match(/^(\d{1,2})\s*(h|hr|hrs|hour|hours)$/);
  if (h) return Number(h[1]) > 0 && Number(h[1]) <= 24 ? Number(h[1]) * 60 : null;
  return null;
}

function localDateTimeMinimum(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export const AppointmentBookingForm: React.FC<AppointmentBookingFormProps> = ({
  businessId, services, idToken, emailVerified, customerName, customerEmail, language, onSignIn,
}) => {
  const t = text[language];
  const [serviceId, setServiceId] = useState('');
  const [startAtLocal, setStartAtLocal] = useState('');
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(customerEmail);
  const [note, setNote] = useState('');
  const [channels, setChannels] = useState<Array<'whatsapp' | 'sms' | 'app'>>(['app']);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  const loadMyAppointments = useCallback(async () => {
    if (!idToken || !emailVerified) {
      setMyAppointments([]);
      return;
    }
    setLoadingAppointments(true);
    try {
      const response = await fetch('/api/appointments', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (response.ok) setMyAppointments(Array.isArray(data.appointments) ? data.appointments : []);
    } finally {
      setLoadingAppointments(false);
    }
  }, [idToken, emailVerified]);


  const loadNotifications = useCallback(async () => {
    if (!idToken || !emailVerified) {
      setNotifications([]);
      return;
    }
    try {
      const response = await fetch('/api/notifications?limit=10', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (response.ok) setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {
      // Booking remains usable if the notification inbox is temporarily unavailable.
    }
  }, [idToken, emailVerified]);

  useEffect(() => { void loadMyAppointments(); }, [loadMyAppointments]);
  useEffect(() => { void loadNotifications(); }, [loadNotifications]);
  useEffect(() => {
    if (!idToken || !emailVerified) return;
    const interval = window.setInterval(() => { void loadNotifications(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [idToken, emailVerified, loadNotifications]);

  const markNotificationRead = async (notificationId: string) => {
    if (!idToken) return;
    const response = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (response.ok) {
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read: true } : item));
    }
  };


  const statusLabel = (status: Appointment['status']) => ({
    pending: t.statusPending,
    confirmed: t.statusConfirmed,
    declined: t.statusDeclined,
    cancelled: t.statusCancelled,
    completed: t.statusCompleted,
    no_show: t.statusNoShow,
  })[status];

  const selectedService = services.find((service) => service.id === serviceId);
  const duration = useMemo(() => selectedService ? durationMinutes(selectedService.durationOrUnit) : null, [selectedService]);
  const canBook = Boolean(idToken && emailVerified);

  const toggleChannel = (channel: 'whatsapp' | 'sms' | 'app') => {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess(false);
    if (!canBook || !idToken || !selectedService || !duration || !startAtLocal || !name.trim() || !/^\+[1-9]\d{7,14}$/.test(phone.trim()) || channels.length === 0) {
      setError(t.required);
      return;
    }
    const start = new Date(startAtLocal);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) {
      setError(t.past);
      return;
    }
    setSending(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          businessId,
          serviceId,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + duration * 60000).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Kigali',
          language,
          requestedBy: 'customer',
          notificationChannels: channels,
          customerNote: note.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.error);
      setSuccess(true);
      setNote('');
      setStartAtLocal('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#D9B96E]/50 bg-[#FBF7EC]/55 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarPlus className="w-5 h-5 text-[#7D611F]" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-[#101D35]">{t.title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">{t.intro}</p>

      {!canBook ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
          <p className="flex items-center gap-2 text-xs text-slate-600"><LockKeyhole className="w-4 h-4 text-[#7D611F]" aria-hidden="true" />{t.signInNote}</p>
          <button type="button" onClick={onSignIn} className="min-h-[42px] w-full rounded-xl bg-[#101D35] px-3 py-2 text-xs font-semibold text-white">{t.signIn}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium text-slate-600">{t.service}
            <select required value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#101D35]">
              <option value="">{t.chooseService}</option>
              {services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationOrUnit || '—'}</option>)}
            </select>
          </label>
          {selectedService && !duration && <p className="text-xs text-amber-800">{t.durationMissing}</p>}
          {selectedService && duration && <p className="text-xs text-slate-500">{t.duration}: {duration} {t.minutes}</p>}
          <label className="block text-xs font-medium text-slate-600">{t.date}
            <input required type="datetime-local" min={localDateTimeMinimum()} value={startAtLocal} onChange={(e) => setStartAtLocal(e.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#101D35]" />
          </label>
          <label className="block text-xs font-medium text-slate-600">{t.name}
            <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#101D35]" />
          </label>
          <label className="block text-xs font-medium text-slate-600">{t.phone}
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2507..." className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#101D35]" />
          </label>
          <label className="block text-xs font-medium text-slate-600">{t.email}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-[#101D35]" />
          </label>
          <label className="block text-xs font-medium text-slate-600">{t.note}
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#101D35]" />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-slate-600">{t.channels}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(['app', 'whatsapp', 'sms'] as const).map((channel) => (
                <label key={channel} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} className="accent-[#101D35]" />
                  {channel === 'app' ? t.app : channel === 'whatsapp' ? t.whatsapp : t.sms}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          {success && <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />{t.success}</p>}
          <button type="submit" disabled={sending || !duration} className="min-h-[44px] w-full rounded-xl bg-[#101D35] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#182A4D] disabled:opacity-50">{sending ? t.sending : t.submit}</button>
        </form>
      )}
      {canBook && (
        <>
        <div className="border-t border-[#D9B96E]/30 pt-3 space-y-2">
          <h4 className="text-xs font-semibold text-[#101D35]">{t.notifications}</h4>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500">{t.noNotifications}</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div key={notification.id} className={`rounded-lg border px-3 py-2.5 ${notification.read ? 'border-slate-200 bg-white' : 'border-[#D9B96E]/60 bg-[#FFF9E9]'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#101D35]">{notification.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{notification.body}</p>
                      {notification.startAt && <p className="mt-1 text-[11px] text-slate-500">{new Intl.DateTimeFormat(language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: notification.timeZone || 'Africa/Kigali' }).format(new Date(notification.startAt))}</p>}
                    </div>
                    {!notification.read && <button type="button" onClick={() => void markNotificationRead(notification.id)} className="shrink-0 text-[10px] font-semibold text-[#7D611F] underline underline-offset-2">{t.markRead}</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-[#D9B96E]/30 pt-3 space-y-2">
          <h4 className="text-xs font-semibold text-[#101D35]">{t.myRequests}</h4>
          {loadingAppointments ? (
            <p className="text-xs text-slate-500">...</p>
          ) : myAppointments.length === 0 ? (
            <p className="text-xs text-slate-500">{t.noRequests}</p>
          ) : (
            <div className="space-y-2">
              {myAppointments.slice(0, 5).map((appointment) => (
                <div key={appointment.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#101D35] truncate">{appointment.serviceName}</p>
                    <p className="text-[11px] text-slate-500">{new Intl.DateTimeFormat(language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: appointment.timeZone || 'Africa/Kigali' }).format(new Date(appointment.startAt))}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${appointment.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : appointment.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(appointment.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
      )}
    </section>
  );
};
