'use client';

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Megaphone,
  MessageSquare,
  Search,
  Store,
  Wallet,
  X,
} from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import HuntCenter from '@/app/plaza/HuntCenter';
import {
  requestHuntHref,
  type PlazaAnnouncement,
  type PlazaDiscussionItem,
  type PlazaRequestItem,
} from '@/app/plaza/plazaShared';
import { presentOfferPrice } from '@/lib/formatPrice';
import { formatModerationRelativeTime } from '@/lib/moderation/relativeTime';
import { PUBLIC_NAVBAR_OFFSET_CLASS } from '@/lib/ui/publicNavbarOffset';

type Tab = 'requests' | 'talk' | 'avisos';
type RequestFilter = 'all' | 'budget' | 'store';

type ListState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

type Notice = { kind: 'success' | 'error'; text: string } | null;

const TABS: Array<{ id: Tab; label: string; icon: ReactNode }> = [
  { id: 'requests', label: 'Solicitudes', icon: <Search className="h-4 w-4" aria-hidden /> },
  { id: 'talk', label: 'Conversaciones', icon: <MessageSquare className="h-4 w-4" aria-hidden /> },
  { id: 'avisos', label: 'Avisos', icon: <Megaphone className="h-4 w-4" aria-hidden /> },
];

const REQUEST_FILTERS: Array<{ id: RequestFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'budget', label: 'Con presupuesto' },
  { id: 'store', label: 'Con tienda' },
];

const card = 'rounded-2xl border border-black/[0.04] bg-white shadow-sm dark:border-white/10 dark:bg-[#141414]';
const field =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[15px] text-[#1d1d1f] placeholder:text-[#a1a1a6] transition-colors duration-150 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 dark:border-white/15 dark:bg-[#1a1a1a] dark:text-[#fafafa] dark:placeholder:text-[#6e6e73] sm:text-sm';
const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-5 text-[14px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-violet-600 dark:focus-visible:ring-offset-[#141414] sm:min-h-0 sm:py-2 sm:text-[13px]';

async function loadList<T>(url: string, key: string): Promise<ListState<T>> {
  try {
    const res = await fetch(url);
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !body) return { status: 'error' };
    const items = body[key];
    return { status: 'ready', items: Array.isArray(items) ? (items as T[]) : [] };
  } catch {
    return { status: 'error' };
  }
}

function parseBudget(raw: string): number | null {
  const value = Number(raw.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function PlazaInner() {
  const { session } = useAuth();
  const { openRegisterModal } = useUI();
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<ListState<PlazaRequestItem>>({ status: 'loading' });
  const [talk, setTalk] = useState<ListState<PlazaDiscussionItem>>({ status: 'loading' });
  const [avisos, setAvisos] = useState<ListState<PlazaAnnouncement>>({ status: 'loading' });
  const [filter, setFilter] = useState<RequestFilter>('all');

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [budget, setBudget] = useState('');
  const [store, setStore] = useState('');
  const [showBudget, setShowBudget] = useState(false);
  const [showStore, setShowStore] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [talkTitle, setTalkTitle] = useState('');
  const [talkBody, setTalkBody] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const fetchRequests = useCallback(() => {
    void loadList<PlazaRequestItem>('/api/plaza/requests?limit=20', 'requests').then(setRequests);
  }, []);
  const fetchTalk = useCallback(() => {
    void loadList<PlazaDiscussionItem>('/api/plaza/discussions', 'discussions').then(setTalk);
  }, []);
  const fetchAvisos = useCallback(() => {
    void loadList<PlazaAnnouncement>('/api/announcements', 'announcements').then(setAvisos);
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchTalk();
    fetchAvisos();
  }, [fetchRequests, fetchTalk, fetchAvisos]);

  const loadRequests = () => {
    setRequests({ status: 'loading' });
    fetchRequests();
  };
  const loadTalk = () => {
    setTalk({ status: 'loading' });
    fetchTalk();
  };
  const loadAvisos = () => {
    setAvisos({ status: 'loading' });
    fetchAvisos();
  };

  const visibleRequests = useMemo(() => {
    if (requests.status !== 'ready') return [];
    if (filter === 'budget') return requests.items.filter((item) => item.budget_max != null && item.budget_max > 0);
    if (filter === 'store') return requests.items.filter((item) => Boolean(item.preferred_store?.trim()));
    return requests.items;
  }, [requests, filter]);

  const changeTab = (next: Tab) => {
    setTab(next);
    setNotice(null);
  };

  const authHeaders = (): Record<string, string> | null => {
    if (!session?.access_token) {
      openRegisterModal('signup');
      return null;
    }
    return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  };

  const submitRequest = async (e: FormEvent) => {
    e.preventDefault();
    const headers = authHeaders();
    if (!headers) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/plaza/requests', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          details: showDetails ? details : '',
          preferred_store: showStore ? store : '',
          budget_max: showBudget ? parseBudget(budget) : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsModeration?: boolean };
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error ?? 'No se pudo publicar la solicitud.' });
        return;
      }
      setTitle('');
      setDetails('');
      setBudget('');
      setStore('');
      setShowBudget(false);
      setShowStore(false);
      setShowDetails(false);
      if (data.needsModeration) {
        setNotice({ kind: 'success', text: 'Solicitud enviada. Será visible en cuanto un moderador la apruebe.' });
      } else {
        setNotice({ kind: 'success', text: 'Solicitud publicada.' });
        loadRequests();
      }
    } catch {
      setNotice({ kind: 'error', text: 'No se pudo publicar la solicitud. Revisa tu conexión.' });
    } finally {
      setSaving(false);
    }
  };

  const submitTalk = async (e: FormEvent) => {
    e.preventDefault();
    const headers = authHeaders();
    if (!headers) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/plaza/discussions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: talkTitle, body: talkBody }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; needsModeration?: boolean };
      if (!res.ok) {
        setNotice({ kind: 'error', text: data.error ?? 'No se pudo publicar la conversación.' });
        return;
      }
      setTalkTitle('');
      setTalkBody('');
      if (data.needsModeration) {
        setNotice({ kind: 'success', text: 'Conversación enviada. Será visible en cuanto un moderador la apruebe.' });
      } else {
        setNotice({ kind: 'success', text: 'Conversación publicada.' });
        loadTalk();
      }
    } catch {
      setNotice({ kind: 'error', text: 'No se pudo publicar la conversación. Revisa tu conexión.' });
    } finally {
      setSaving(false);
    }
  };

  const noticeBanner = notice ? (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[14px] ${
        notice.kind === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
      }`}
    >
      {notice.kind === 'success' ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <p className="min-w-0 flex-1">{notice.text}</p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Cerrar aviso"
        className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  ) : null;

  const optionChip = (pressed: boolean, onClick: () => void, icon: ReactNode, label: string) => (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:min-h-0 sm:py-1.5 ${
        pressed
          ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-300'
          : 'border-black/10 text-[#6e6e73] hover:border-violet-200 hover:text-violet-700 dark:border-white/15 dark:text-[#a3a3a3] dark:hover:border-violet-800 dark:hover:text-violet-300'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const requestComposer = (
    <form onSubmit={submitRequest} className={`${card} p-4 sm:p-5`} aria-labelledby="plaza-request-title">
      <h2 id="plaza-request-title" className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
        Pedir una oferta
      </h2>
      <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Cuéntale a la comunidad qué quieres cazar.</p>
      <label htmlFor="plaza-request-input" className="sr-only">
        ¿Qué estás buscando?
      </label>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a1a1a6]" aria-hidden />
        <input
          id="plaza-request-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. AirPods Pro 2 por menos de $3,500, nuevos o reacondicionados"
          maxLength={120}
          minLength={4}
          required
          className={`${field} pl-10`}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {optionChip(showBudget, () => setShowBudget((v) => !v), <Wallet className="h-3.5 w-3.5" aria-hidden />, 'Presupuesto')}
        {optionChip(showStore, () => setShowStore((v) => !v), <Store className="h-3.5 w-3.5" aria-hidden />, 'Tienda')}
        {optionChip(showDetails, () => setShowDetails((v) => !v), <MessageSquare className="h-3.5 w-3.5" aria-hidden />, 'Detalles')}
      </div>
      {showBudget || showStore ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {showBudget ? (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Presupuesto máximo (MXN)</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#a1a1a6]" aria-hidden>
                  $
                </span>
                <input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  inputMode="decimal"
                  placeholder="3,500"
                  className={`${field} pl-7`}
                />
              </div>
            </label>
          ) : null}
          {showStore ? (
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Tienda preferida</span>
              <input value={store} onChange={(e) => setStore(e.target.value)} maxLength={80} placeholder="Amazon, Liverpool…" className={field} />
            </label>
          ) : null}
        </div>
      ) : null}
      {showDetails ? (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-medium text-[#6e6e73] dark:text-[#a3a3a3]">Detalles</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Color, condición, para cuándo lo necesitas…"
            className={field}
          />
        </label>
      ) : null}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
          {session ? 'Un moderador revisa cada solicitud antes de publicarla.' : 'Necesitas una cuenta para publicar.'}
        </p>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Publicando…' : 'Publicar solicitud'}
        </button>
      </div>
    </form>
  );

  const requestList = (
    <section aria-labelledby="plaza-active-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="plaza-active-title" className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            Solicitudes activas
          </h2>
          <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Más recientes primero</p>
        </div>
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filtrar solicitudes">
        {REQUEST_FILTERS.map((item) => {
          const selected = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(item.id)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 sm:min-h-0 sm:py-1.5 ${
                selected
                  ? 'bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f]'
                  : 'bg-white text-[#6e6e73] shadow-sm hover:text-[#1d1d1f] dark:bg-[#141414] dark:text-[#a3a3a3] dark:hover:text-[#fafafa]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {requests.status === 'loading' ? <ListSkeleton /> : null}
      {requests.status === 'error' ? <ListError what="las solicitudes" onRetry={loadRequests} /> : null}
      {requests.status === 'ready' && visibleRequests.length === 0 ? (
        <EmptyCard
          icon={<Search className="h-5 w-5" aria-hidden />}
          title={requests.items.length === 0 ? 'Aún no hay solicitudes' : 'Nada con este filtro'}
          body={
            requests.items.length === 0
              ? 'Sé la primera persona en pedir algo. La comunidad te ayuda a cazarlo.'
              : 'Prueba con otro filtro para ver más solicitudes.'
          }
        />
      ) : null}
      {visibleRequests.length > 0 ? (
        <ul className="space-y-3">
          {visibleRequests.map((item) => (
            <li key={item.id}>
              <RequestCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const talkComposer = (
    <form onSubmit={submitTalk} className={`${card} p-4 sm:p-5`} aria-labelledby="plaza-talk-title">
      <h2 id="plaza-talk-title" className="text-[17px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
        Abrir conversación
      </h2>
      <p className="mt-0.5 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Comparte dudas, tips o hallazgos con la comunidad.</p>
      <label htmlFor="plaza-talk-topic" className="sr-only">
        Tema
      </label>
      <input
        id="plaza-talk-topic"
        value={talkTitle}
        onChange={(e) => setTalkTitle(e.target.value)}
        placeholder="Tema"
        maxLength={120}
        minLength={4}
        required
        className={`${field} mt-3`}
      />
      <label htmlFor="plaza-talk-body" className="sr-only">
        Mensaje
      </label>
      <textarea
        id="plaza-talk-body"
        value={talkBody}
        onChange={(e) => setTalkBody(e.target.value)}
        placeholder="¿Qué quieres comentar con la comunidad?"
        rows={4}
        maxLength={2000}
        minLength={8}
        required
        className={`${field} mt-2`}
      />
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
          {session ? 'Un moderador revisa cada conversación antes de publicarla.' : 'Necesitas una cuenta para publicar.'}
        </p>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    </form>
  );

  const talkList = (
    <section aria-label="Conversaciones" className="space-y-3">
      {talk.status === 'loading' ? <ListSkeleton /> : null}
      {talk.status === 'error' ? <ListError what="las conversaciones" onRetry={loadTalk} /> : null}
      {talk.status === 'ready' && talk.items.length === 0 ? (
        <EmptyCard
          icon={<MessageSquare className="h-5 w-5" aria-hidden />}
          title="Todavía no hay conversaciones"
          body="Abre el primer tema y empieza la plática."
        />
      ) : null}
      {talk.status === 'ready' && talk.items.length > 0 ? (
        <ul className="space-y-3">
          {talk.items.map((item) => (
            <li key={item.id}>
              <article className={`${card} p-4 sm:p-5`}>
                <p className="flex items-center gap-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <time dateTime={item.created_at}>{formatModerationRelativeTime(item.created_at)}</time>
                </p>
                <h3 className="mt-1 text-[15px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h3>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{item.body}</p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const avisosList = (
    <section aria-label="Avisos" className="space-y-3">
      {avisos.status === 'loading' ? <ListSkeleton /> : null}
      {avisos.status === 'error' ? <ListError what="los avisos" onRetry={loadAvisos} /> : null}
      {avisos.status === 'ready' && avisos.items.length === 0 ? (
        <EmptyCard
          icon={<Megaphone className="h-5 w-5" aria-hidden />}
          title="No hay avisos por ahora"
          body="Aquí verás novedades y anuncios del equipo de Aventa."
        />
      ) : null}
      {avisos.status === 'ready' && avisos.items.length > 0 ? (
        <ul className="space-y-3">
          {avisos.items.map((item) => (
            <li key={item.id}>
              <article className={`${card} flex gap-3 p-4 sm:p-5`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
                  <Megaphone className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h3>
                  {item.body ? <p className="mt-1 break-words text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{item.body}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <time dateTime={item.created_at} className="text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                      {formatModerationRelativeTime(item.created_at)}
                    </time>
                    {item.link ? (
                      <a
                        href={item.link}
                        className="inline-flex min-h-11 items-center rounded-md text-[13px] font-semibold text-violet-600 transition-colors duration-150 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400 dark:hover:text-violet-300 sm:min-h-0"
                      >
                        Ver más
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );

  const top = tab === 'requests' ? requestComposer : tab === 'talk' ? talkComposer : null;
  const bottom = tab === 'requests' ? requestList : tab === 'talk' ? talkList : avisosList;

  return (
    <div className={`mx-auto max-w-6xl px-4 pb-28 md:px-8 md:pb-12 ${PUBLIC_NAVBAR_OFFSET_CLASS}`}>
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">Comunidad</p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight text-[#1d1d1f] dark:text-[#fafafa] sm:text-[32px]">Plaza</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
          Pide lo que quieres cazar, encuentra ofertas que otros están buscando y conversa con la comunidad.
        </p>
      </header>

      <div
        className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-black/[0.06] px-4 [scrollbar-width:none] dark:border-white/10 md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Secciones de Plaza"
      >
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`plaza-tab-${item.id}`}
              aria-selected={selected}
              aria-controls="plaza-panel"
              onClick={() => changeTab(item.id)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 ${
                selected
                  ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                  : 'border-transparent text-[#6e6e73] hover:border-black/10 hover:text-[#1d1d1f] active:text-[#1d1d1f] dark:text-[#a3a3a3] dark:hover:border-white/20 dark:hover:text-[#fafafa]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id="plaza-panel"
        role="tabpanel"
        aria-labelledby={`plaza-tab-${tab}`}
        className="mt-5 grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      >
        {noticeBanner || top ? (
          <div className="order-1 min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
            {noticeBanner}
            {top}
          </div>
        ) : null}
        <aside
          className={`min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 ${tab === 'requests' ? 'order-2' : 'order-3'}`}
          aria-label="Centro de Caza"
        >
          <HuntCenter
            requests={requests.status === 'ready' ? requests.items : []}
            requestsLoading={requests.status === 'loading'}
            requestsFailed={requests.status === 'error'}
          />
        </aside>
        <div
          className={`min-w-0 lg:col-start-1 ${noticeBanner || top ? 'lg:row-start-2' : 'lg:row-start-1'} ${tab === 'requests' ? 'order-3' : 'order-2'}`}
        >
          {bottom}
        </div>
      </div>
    </div>
  );
}

function RequestCard({ item }: { item: PlazaRequestItem }) {
  const budget = item.budget_max != null && item.budget_max > 0 ? presentOfferPrice(item.budget_max) : null;
  const store = item.preferred_store?.trim() || null;
  return (
    <article className={`${card} p-4 transition-colors duration-150 hover:border-violet-200 dark:hover:border-violet-900/60 sm:p-5`}>
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
          <Search className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <time dateTime={item.created_at}>{formatModerationRelativeTime(item.created_at)}</time>
          </p>
          <h3 className="mt-0.5 break-words text-[15px] font-semibold leading-snug text-[#1d1d1f] dark:text-[#fafafa]">{item.title}</h3>
          {item.details ? (
            <p className="mt-1 line-clamp-3 break-words text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{item.details}</p>
          ) : null}
          {budget || store ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {budget ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Wallet className="h-3.5 w-3.5" aria-hidden />
                  Hasta {budget}
                </span>
              ) : null}
              {store ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-black/[0.04] px-2.5 py-1 text-[12px] font-medium text-[#1d1d1f] dark:bg-white/10 dark:text-[#fafafa]">
                  <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{store}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-3.5 flex justify-end border-t border-black/[0.05] pt-3 dark:border-white/10">
        <Link
          href={requestHuntHref(item)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-violet-600 px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:bg-violet-700 active:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#141414] sm:min-h-0 sm:py-2"
        >
          Ayudar a cazar
        </Link>
      </div>
    </article>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((key) => (
        <div key={key} className={`${card} p-4 sm:p-5`}>
          <div className="flex gap-3">
            <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-black/5 dark:bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-black/5 dark:bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className={`${card} p-5`} role="alert">
      <p className="text-[15px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">No pudimos cargar {what}.</p>
      <p className="mt-1 text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">Revisa tu conexión e inténtalo de nuevo.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center rounded-full border border-black/10 px-4 text-[13px] font-semibold text-[#1d1d1f] transition-colors duration-150 hover:bg-black/[0.03] active:bg-black/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-white/15 dark:text-[#fafafa] dark:hover:bg-white/5 sm:min-h-0 sm:py-2"
      >
        Reintentar
      </button>
    </div>
  );
}

function EmptyCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className={`${card} flex flex-col items-center px-5 py-8 text-center`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300" aria-hidden>
        {icon}
      </span>
      <p className="mt-3 text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-[#6e6e73] dark:text-[#a3a3a3]">{body}</p>
    </div>
  );
}

export default function PlazaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]" />}>
      <ClientLayout>
        <div className="min-h-screen overflow-x-clip bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <PlazaInner />
        </div>
      </ClientLayout>
    </Suspense>
  );
}
