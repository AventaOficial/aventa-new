'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HUNTER_CATEGORIES, HUNTER_RETAILERS, HUNTER_SORTS, REJECTION_REASONS } from '@/lib/huntersAi/contract';
import type { HunterCard } from '@/lib/huntersAi/present';
import { HunterMark } from '@/app/components/hunters/HunterIdentity';

type Metrics = {
  pending: number;
  needsReview: number;
  approved: number;
  rejected: number;
  published: number;
  discoveredToday: number;
};
type StatusFilter = 'PENDING' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

const STATUS_LABEL: Record<StatusFilter, string> = {
  PENDING: 'Pendientes',
  NEEDS_REVIEW: 'Necesitan revisión',
  APPROVED: 'Aprobadas',
  REJECTED: 'Rechazadas',
};

const QUEUE_LABEL: Record<HunterCard['queueStatus'], string> = {
  PENDING: 'Pendiente',
  NEEDS_REVIEW: 'Necesita revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

const SORT_LABEL: Record<(typeof HUNTER_SORTS)[number], string> = {
  score: 'Deal score',
  discount: 'Descuento',
  savings: 'Ahorro absoluto',
  price: 'Precio',
  discovered: 'Fecha de descubrimiento',
};

function ago(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'ahora';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} d`;
}

function money(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(value);
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export default function HuntersAiClient() {
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [category, setCategory] = useState('');
  const [retailer, setRetailer] = useState('');
  const [hunter, setHunter] = useState('');
  const [sort, setSort] = useState<(typeof HUNTER_SORTS)[number]>('score');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<HunterCard[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<HunterCard | null>(null);
  const [rejecting, setRejecting] = useState<HunterCard | null>(null);
  const [reasonId, setReasonId] = useState('low_discount');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams({ status, sort, page: String(page) });
    if (category) params.set('category', category);
    if (retailer) params.set('retailer', retailer);
    if (hunter) params.set('hunter', hunter);
    return params.toString();
  }, [status, sort, page, category, retailer, hunter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/hunters-ai?${query}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo cargar la cola.');
      setItems(body.items ?? []);
      setMetrics(body.metrics ?? null);
      setHasMore(Boolean(body.hasMore));
      setActive(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/hunters-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'No se pudo guardar.');
        setNotice('Guardado.');
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error de red.');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const current = items[active] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingTarget(e.target) || editing || rejecting || busy) return;
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        setActive((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if ((e.key === 'a' || e.key === 'A') && current?.canApprove && !current.duplicate) {
        e.preventDefault();
        void act({ action: 'approve', batchId: current.batchId, itemId: current.id });
      } else if ((e.key === 'e' || e.key === 'E') && current?.canEdit) {
        e.preventDefault();
        setEditing(current);
      } else if ((e.key === 'r' || e.key === 'R') && current?.canReject) {
        e.preventDefault();
        setRejecting(current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, busy, current, editing, items.length, rejecting]);

  return (
    <div className="min-h-screen bg-[#0c0c12] text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hunters IA</h1>
            <p className="mt-1 text-sm text-white/60">Un candidato a la vez. El producto sigue siendo lo que se publica.</p>
          </div>
          <p className="text-xs text-white/40">A aprobar · E editar · R rechazar · J/K moverse</p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-6">
          {(
            [
              ['Pendientes', metrics?.pending],
              ['En revisión', metrics?.needsReview],
              ['Aprobadas', metrics?.approved],
              ['Rechazadas', metrics?.rejected],
              ['Publicadas', metrics?.published],
              ['Descubiertas hoy', metrics?.discoveredToday],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-white/45">{label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{value ?? '—'}</p>
            </div>
          ))}
        </section>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${status === key ? 'bg-violet-600 text-white' : 'bg-white/5 text-white/70'}`}
            >
              {STATUS_LABEL[key]}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <select className={field} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">Categoría</option>
            {HUNTER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={field} value={retailer} onChange={(e) => { setRetailer(e.target.value); setPage(1); }}>
            <option value="">Tienda</option>
            {HUNTER_RETAILERS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className={field} placeholder="Hunter" value={hunter} onChange={(e) => { setHunter(e.target.value); setPage(1); }} />
          <select className={field} value={sort} onChange={(e) => setSort(e.target.value as (typeof HUNTER_SORTS)[number])}>
            {HUNTER_SORTS.map((key) => <option key={key} value={key}>{SORT_LABEL[key]}</option>)}
          </select>
        </div>

        {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
        {notice ? <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{notice}</p> : null}

        {loading ? (
          <p className="mt-10 text-center text-white/50">Cargando candidatos…</p>
        ) : items.length === 0 ? (
          <Empty status={status} metrics={metrics} />
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((card, index) => (
              <li key={card.id}>
                <article
                  className={`rounded-2xl border bg-[#14141c] p-4 ${index === active ? 'border-violet-400/50' : 'border-white/10'}`}
                  onClick={() => setActive(index)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <HunterMark name={card.hunter.name} accent={card.hunter.accent} avatarUrl={card.hunter.avatarUrl} size={36} />
                        <div>
                          <p className="text-sm font-semibold text-white">{card.hunter.displayName}</p>
                          <p className="text-xs text-white/50">{card.hunter.role} · Encontró esto {ago(card.discoveredAt)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/55">
                        <span className="rounded-full bg-white/10 px-2 py-0.5">{card.pipelineStatus === 'PUBLISHED' ? 'Publicada' : QUEUE_LABEL[card.queueStatus]}</span>
                        {card.dealScore != null ? <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-orange-100">Deal score {card.dealScore}</span> : <span>Sin deal score del hunter</span>}
                        {card.dailyNeed ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-100">Uso diario</span> : null}
                        {card.duplicate ? <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-100">DUPLICADO</span> : null}
                      </div>
                      <h2 className="mt-2 text-lg font-semibold">{card.title}</h2>
                      <a href={card.sourceUrl} target="_blank" rel="noreferrer" className="text-sm text-violet-300 hover:underline">
                        {card.retailer}
                      </a>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold tabular-nums">{money(card.price)}</p>
                      <p className="text-sm text-white/40 line-through">{money(card.referencePrice)}</p>
                      <p className="text-sm text-emerald-300">{card.discountPercent != null ? `-${card.discountPercent}%` : '—'}</p>
                      <p className="text-xs text-white/50">{card.absoluteSavings != null ? `Ahorro ${money(card.absoluteSavings)}` : 'Sin ahorro calculado'}</p>
                      {card.unitPrice != null ? <p className="text-xs text-white/50">{money(card.unitPrice)}{card.unitLabel ? ` / ${card.unitLabel}` : ''}</p> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                    <History history={card.history} price={card.price} />
                    <p><span className="text-white/45">Evidencia</span><br />{card.evidenceGrade ?? 'Sin grado'}</p>
                    <div>
                      <p className="text-white/45">Por qué es buena oferta</p>
                      <p className="mt-1 text-white/80">{card.whyGoodDeal || 'Sin explicación editorial'}</p>
                    </div>
                  </div>
                  {card.description ? <p className="mt-3 text-sm text-white/55">{card.description}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={busy || !card.canApprove || card.duplicate} className={btnPrimary} onClick={() => void act({ action: 'approve', batchId: card.batchId, itemId: card.id })}>Aprobar</button>
                    <button type="button" disabled={busy || !card.canEdit} className={btn} onClick={() => setEditing(card)}>Editar</button>
                    <button type="button" disabled={busy || !card.canReject} className={btnDanger} onClick={() => setRejecting(card)}>Rechazar</button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-between text-sm">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
          <span className="text-white/45">Página {page}</span>
          <button type="button" className={btn} disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      </div>

      {editing ? (
        <Editor
          card={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (fields) => {
            await act({ action: 'edit', batchId: editing.batchId, itemId: editing.id, ...fields });
            setEditing(null);
          }}
        />
      ) : null}
      {rejecting ? (
        <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            className="w-full max-w-md rounded-2xl bg-[#16161f] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void act({ action: 'reject', batchId: rejecting.batchId, itemId: rejecting.id, reasonId, note }).then(() => setRejecting(null));
            }}
          >
            <h3 className="text-lg font-semibold">Rechazar</h3>
            <select className={`${field} mt-3 w-full`} value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
              {REJECTION_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <textarea className={`${field} mt-2 w-full`} rows={3} placeholder="Nota opcional" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setRejecting(null)}>Cancelar</button>
              <button type="submit" className={btnDanger} disabled={busy}>Rechazar</button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

function History({ history, price }: { history: HunterCard['history']; price: number | null }) {
  if (!history.available) return <p className="text-white/55">Historial insuficiente</p>;
  return (
    <div>
      <p className="text-white/45">Historial</p>
      <p>Precio actual: {money(price)}</p>
      {history.habitualMin != null || history.habitualMax != null ? (
        <p>Precio habitual observado: {money(history.habitualMin)}–{money(history.habitualMax)}</p>
      ) : null}
      {history.reading ? <p className="mt-1 text-emerald-200">{history.reading}</p> : null}
      {history.historicalMin != null ? <p>Mínimo conocido: {money(history.historicalMin)}</p> : null}
      {history.average != null ? <p>Promedio: {money(history.average)}</p> : null}
      {history.days != null ? <p>{history.days} días de historial</p> : null}
    </div>
  );
}

function Empty({ status, metrics }: { status: StatusFilter; metrics: Metrics | null }) {
  const worked = (metrics?.approved ?? 0) + (metrics?.rejected ?? 0) + (metrics?.published ?? 0) > 0;
  if (status === 'PENDING' && worked) {
    return (
      <div className="mt-16 text-center">
        <p className="text-lg">Cola limpia.</p>
        <p className="mt-2 text-sm text-white/50">Los Hunters hicieron su trabajo. No hay ofertas pendientes.</p>
      </div>
    );
  }
  return (
    <div className="mt-16 text-center">
      <p className="text-lg">Los Hunters están cazando 🔎</p>
      <p className="mt-2 text-sm text-white/50">Cuando encuentren nuevas oportunidades aparecerán aquí.</p>
    </div>
  );
}

function Editor({
  card,
  busy,
  onClose,
  onSave,
}: {
  card: HunterCard;
  busy: boolean;
  onClose: () => void;
  onSave: (fields: { title: string; category: string; description: string; whyGoodDeal: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(card.title);
  const [category, setCategory] = useState(card.category ?? '');
  const [description, setDescription] = useState(card.description);
  const [whyGoodDeal, setWhy] = useState(card.whyGoodDeal);
  return (
    <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-lg rounded-2xl bg-[#16161f] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ title, category, description, whyGoodDeal });
        }}
      >
        <h3 className="text-lg font-semibold">Editar candidato</h3>
        <p className="mt-1 text-xs text-white/45">El precio y la evidencia de tienda no se editan aquí.</p>
        <input className={`${field} mt-3 w-full`} value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className={`${field} mt-2 w-full`} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Sin categoría</option>
          {HUNTER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <textarea className={`${field} mt-2 w-full`} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" />
        <textarea className={`${field} mt-2 w-full`} rows={3} value={whyGoodDeal} onChange={(e) => setWhy(e.target.value)} placeholder="Por qué es buena oferta" />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btnPrimary} disabled={busy}>Guardar</button>
        </div>
      </form>
    </dialog>
  );
}

const field = 'rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white';
const btn = 'rounded-lg border border-white/10 px-3 py-1.5 text-sm disabled:opacity-40';
const btnPrimary = 'rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-40';
const btnDanger = 'rounded-lg bg-red-600/80 px-3 py-1.5 text-sm font-medium disabled:opacity-40';
