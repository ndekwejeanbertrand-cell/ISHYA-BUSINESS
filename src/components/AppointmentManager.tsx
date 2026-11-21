import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, Clock3, RefreshCw, X } from 'lucide-react';
import type { Appointment, Language } from '../types';

interface AppointmentManagerProps {
  businessId: string;
  idToken: string | null;
  language: Language;
}

const copy = {
  rw: {
    title: 'Gahunda z’abakiriya',
    subtitle: 'Emeza cyangwa wange ubusabe bw’abakiriya. Gahunda zemejwe ni zo zibarwa nk’izafashwe.',
    pending: 'Zitegereje kwemezwa',
    confirmed: 'Zemejwe',
    other: 'Izindi',
    loading: 'Birimo kugezwa...',
    empty: 'Nta gahunda ziraboneka.',
    refresh: 'Kuvugurura',
    approve: 'Emeza',
    decline: 'Anga',
    cancel: 'Hagarika',
    complete: 'Byarangiye',
    noShow: 'Ntiyitabiriye',
    customer: 'Umukiriya',
    service: 'Serivisi',
    date: 'Itariki n’isaha',
    note: 'Icyitonderwa',
    error: 'Ntibyashobotse kubona cyangwa guhindura gahunda.',
    working: 'Birimo...',
    statuses: { pending: 'Itegereje', confirmed: 'Yemejwe', declined: 'Yanzwe', cancelled: 'Yahagaritswe', completed: 'Yarangiye', no_show: 'Ntiyitabiriye' },
  },
  en: {
    title: 'Customer appointments',
    subtitle: 'Approve or decline customer requests. Only confirmed appointments are treated as booked.',
    pending: 'Pending approval',
    confirmed: 'Confirmed',
    other: 'Other',
    loading: 'Loading appointments...',
    empty: 'No appointments found.',
    refresh: 'Refresh',
    approve: 'Approve',
    decline: 'Decline',
    cancel: 'Cancel',
    complete: 'Complete',
    noShow: 'No-show',
    customer: 'Customer',
    service: 'Service',
    date: 'Date & time',
    note: 'Note',
    error: 'Could not load or update appointments.',
    working: 'Working...',
    statuses: { pending: 'Pending', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled', completed: 'Completed', no_show: 'No-show' },
  },
  fr: {
    title: 'Rendez-vous clients',
    subtitle: 'Acceptez ou refusez les demandes. Seuls les rendez-vous confirmés sont considérés comme réservés.',
    pending: 'En attente',
    confirmed: 'Confirmés',
    other: 'Autres',
    loading: 'Chargement...',
    empty: 'Aucun rendez-vous.',
    refresh: 'Actualiser',
    approve: 'Accepter',
    decline: 'Refuser',
    cancel: 'Annuler',
    complete: 'Terminer',
    noShow: 'Absent',
    customer: 'Client',
    service: 'Service',
    date: 'Date et heure',
    note: 'Note',
    error: 'Impossible de charger ou modifier les rendez-vous.',
    working: 'Traitement...',
    statuses: { pending: 'En attente', confirmed: 'Confirmé', declined: 'Refusé', cancelled: 'Annulé', completed: 'Terminé', no_show: 'Absent' },
  },
} as const;

export const AppointmentManager: React.FC<AppointmentManagerProps> = ({ businessId, idToken, language }) => {
  const t = copy[language];
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!idToken || !businessId) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/appointments?businessId=${encodeURIComponent(businessId)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.error);
      setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setLoading(false);
    }
  }, [businessId, idToken, t.error]);

  useEffect(() => { void load(); }, [load]);

  const updateStatus = async (appointment: Appointment, status: Appointment['status']) => {
    if (!idToken) return;
    setBusyId(appointment.id);
    setError(null);
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointment.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t.error);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusyId(null);
    }
  };

  const groups: { title: string; items: Appointment[] }[] = [
    { title: t.pending, items: appointments.filter((item) => item.status === 'pending') },
    { title: t.confirmed, items: appointments.filter((item) => item.status === 'confirmed') },
    { title: t.other, items: appointments.filter((item) => !['pending', 'confirmed'].includes(item.status)) },
  ];

  return (
    <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#7D611F]" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-[#101D35]">{t.title}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">{t.subtitle}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-[#101D35] hover:border-[#D9B96E] disabled:opacity-50 inline-flex items-center gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          {t.refresh}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">{error}</div>}
      {loading ? <p className="py-5 text-sm text-slate-500">{t.loading}</p> : appointments.length === 0 ? <p className="py-5 text-sm text-slate-500">{t.empty}</p> : (
        <div className="space-y-5">
          {groups.filter((group) => group.items.length > 0).map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title} ({group.items.length})</h3>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {group.items.map((item) => (
                  <article key={item.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#101D35] truncate">{item.customerName}</p>
                        <p className="text-xs text-slate-500">{item.customerPhone}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : item.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {t.statuses[item.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div><span className="block text-slate-400">{t.service}</span><span className="font-medium text-slate-700">{item.serviceName}</span></div>
                      <div><span className="block text-slate-400">{t.date}</span><span className="font-medium text-slate-700 inline-flex items-center gap-1"><Clock3 className="w-3 h-3" aria-hidden="true" />{new Intl.DateTimeFormat(language === 'rw' ? 'rw-RW' : language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: item.timeZone || 'Africa/Kigali' }).format(new Date(item.startAt))}</span></div>
                    </div>
                    {item.customerNote && <p className="text-xs text-slate-500"><span className="font-medium">{t.note}: </span>{item.customerNote}</p>}
                    {item.status === 'pending' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, 'confirmed')} className="min-h-[38px] px-3 rounded-lg bg-[#101D35] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Check className="w-3.5 h-3.5" aria-hidden="true" />{busyId === item.id ? t.working : t.approve}</button>
                        <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, 'declined')} className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><X className="w-3.5 h-3.5" aria-hidden="true" />{t.decline}</button>
                      </div>
                    )}
                    {item.status === 'confirmed' && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, 'completed')} className="min-h-[38px] px-3 rounded-lg bg-[#101D35] text-white text-xs font-semibold disabled:opacity-50">{t.complete}</button>
                        <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, 'no_show')} className="min-h-[38px] px-3 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold disabled:opacity-50">{t.noShow}</button>
                        <button type="button" disabled={busyId === item.id} onClick={() => void updateStatus(item, 'cancelled')} className="min-h-[38px] px-3 rounded-lg border border-red-200 text-red-700 text-xs font-semibold disabled:opacity-50">{t.cancel}</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
