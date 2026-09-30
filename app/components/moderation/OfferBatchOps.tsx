'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { readAcquisitionAttribution } from '@/lib/acquisition/attribution';
import { loteBasePath, pendingBasePath, type ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';
import {
  BATCH_ITEM_STATUS_LABEL,
  BATCH_STATUS_LABEL,
  OFFER_BATCH_MAX_ITEMS,
  canApproveFrom,
  canEditFrom,
  canRejectFrom,
  canReprocessFrom,
  presentBatchItem,
  type BatchItemStatus,
  type BatchStatus,
} from '@/lib/offers/batch/contract';
import type { OfferBatchEventRow, OfferBatchItemRow, OfferBatchRow } from '@/lib/offers/batch/service';

type BatchListRow = OfferBatchRow & { author_name?: string | null; kinds?: string[] };

type ItemFilter = 'all' | 'ready' | 'review' | 'errors' | 'duplicates' | 'published';

const FILTERS: Array<{ id: ItemFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'ready', label: 'Listos' },
  { id: 'review', label: 'Revisar' },
  { id: 'errors', label: 'Errores' },
  { id: 'duplicates', label: 'Duplicados' },
  { id: 'published', label: 'Publicados' },
];

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function completenessRank(item: OfferBatchItemRow): number {
  const hasTitle = Boolean(item.title?.trim());
  const hasPrice = item.price != null && Number(item.price) > 0;
  const hasImage = Array.isArray(item.images) && item.images.length > 0;
  if (hasTitle && hasPrice && hasImage) return 0;
  if (item.extraction_status === 'failed' || item.status === 'ERROR' || !hasTitle) return 2;
  return 1;
}

function matchesFilter(item: OfferBatchItemRow, filter: ItemFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'ready') return item.status === 'READY';
  if (filter === 'review') return item.status === 'NEEDS_REVIEW';
  if (filter === 'errors') return item.status === 'ERROR';
  if (filter === 'duplicates') return item.duplicate_status === 'duplicate' || item.duplicate_status === 'in_batch';
  if (filter === 'published') return item.status === 'PUBLISHED' || item.status === 'APPROVED';
  return true;
}

function statusTone(status: BatchItemStatus, ui: ReturnType<typeof moderationUi>): string {
  if (status === 'READY') return ui.ws ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-200';
  if (status === 'NEEDS_REVIEW') return ui.ws ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-200';
  if (status === 'ERROR') return ui.ws ? 'bg-red-100 text-red-800' : 'bg-red-500/20 text-red-200';
  if (status === 'PUBLISHED' || status === 'APPROVED')
    return ui.ws ? 'bg-violet-100 text-violet-800' : 'bg-violet-500/20 text-violet-200';
  if (status === 'REJECTED') return ui.ws ? 'bg-gray-100 text-gray-600' : 'bg-white/10 text-white/50';
  return ui.ws ? 'bg-gray-100 text-gray-700' : 'bg-white/10 text-white/70';
}

export default function OfferBatchOps({
  mode,
  batchId = null,
  autoProcess = false,
}: {
  mode: ModerationHubMode;
  batchId?: string | null;
  autoProcess?: boolean;
}) {
  const ui = moderationUi(mode);
  const router = useRouter();
  const { session } = useAuth();
  const base = loteBasePath(mode);
  const pendingHref = pendingBasePath(mode);

  const [paste, setPaste] = useState('');
  const [batches, setBatches] = useState<BatchListRow[]>([]);
  const [batch, setBatch] = useState<OfferBatchRow | null>(null);
  const [items, setItems] = useState<OfferBatchItemRow[]>([]);
  const [events, setEvents] = useState<OfferBatchEventRow[]>([]);
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const autoStarted = useRef(false);

  const headers = useCallback((): Record<string, string> | null => {
    const token = session?.access_token;
    if (!token) {
      setBanner('Inicia sesión para trabajar con estos grupos de ofertas.');
      return null;
    }
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, [session?.access_token]);

  const loadList = useCallback(async () => {
    const h = headers();
    if (!h) return;
    const res = await fetch('/api/admin/offer-batch', { headers: h, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.batches)) setBatches(data.batches);
  }, [headers]);

  const loadDetail = useCallback(async () => {
    if (!batchId) return;
    const h = headers();
    if (!h) return;
    const res = await fetch(`/api/admin/offer-batch/${batchId}`, { headers: h, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBanner(data.error || 'No se pudo abrir el lote.');
      return;
    }
    setBatch(data.batch ?? null);
    setItems(Array.isArray(data.items) ? data.items : []);
    setEvents(Array.isArray(data.events) ? data.events : []);
  }, [batchId, headers]);

  useEffect(() => {
    if (batchId) void loadDetail();
    else void loadList();
  }, [batchId, loadDetail, loadList]);

  const visible = useMemo(() => {
    const rows = items.filter((it) => matchesFilter(it, filter));
    return rows.sort((a, b) => completenessRank(a) - completenessRank(b) || a.position - b.position);
  }, [items, filter]);

  async function createBatch() {
    const h = headers();
    if (!h) return;
    setBusy('create');
    setBanner(null);
    try {
      const res = await fetch('/api/admin/offer-batch', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ text: paste }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data.error || 'No se pudo crear el lote.');
        return;
      }
      const id = data.batch?.id;
      if (typeof id === 'string') router.push(`${base}/${id}?process=1`);
    } finally {
      setBusy(null);
    }
  }

  async function processUntilDone() {
    if (!batchId) return;
    const h = headers();
    if (!h) return;
    setBusy('process');
    setBanner(null);
    try {
      let remaining = 1;
      let guard = 0;
      while (remaining > 0 && guard < 40) {
        const res = await fetch(`/api/admin/offer-batch/${batchId}/process`, {
          method: 'POST',
          headers: h,
          body: '{}',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setBanner(data.error || 'Falló el procesamiento.');
          break;
        }
        remaining = Number(data.remaining ?? 0);
        if (data.batch) setBatch(data.batch);
        if (Array.isArray(data.items) && data.items.length > 0) {
          setItems((prev) => {
            const byId = new Map(prev.map((it) => [it.id, it]));
            for (const it of data.items as OfferBatchItemRow[]) byId.set(it.id, it);
            return [...byId.values()].sort((a, b) => a.position - b.position);
          });
        }
        guard += 1;
      }
      await loadDetail();
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    if (!autoProcess || !batch || autoStarted.current) return;
    if ((batch.pending_items ?? 0) <= 0) return;
    autoStarted.current = true;
    void processUntilDone();
  }, [autoProcess, batch]);

  async function runItem(itemId: string, action: string, extra: Record<string, unknown> = {}) {
    if (!batchId) return;
    const h = headers();
    if (!h) return;
    setBusy(`${action}:${itemId}`);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/offer-batch/${batchId}/items/${itemId}`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data.error || 'La acción no se completó.');
        if (data.item) {
          setItems((prev) => prev.map((it) => (it.id === itemId ? data.item : it)));
        }
        return;
      }
      if (data.item) {
        setItems((prev) => prev.map((it) => (it.id === itemId ? data.item : it)));
      }
      await loadDetail();
    } finally {
      setBusy(null);
    }
  }

  async function runBulk(action: 'approve' | 'reject' | 'reprocess') {
    if (!batchId || selected.size === 0) return;
    const h = headers();
    if (!h) return;
    setBusy(`bulk:${action}`);
    setBulkNote(null);
    try {
      const res = await fetch(`/api/admin/offer-batch/${batchId}/bulk`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ action, itemIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data.error || 'La acción masiva no se completó.');
        return;
      }
      const s = data.summary;
      setBulkNote(`Procesados: ${s?.processed ?? 0} · Exitosos: ${s?.succeeded ?? 0} · Fallidos: ${s?.failed ?? 0}`);
      setSelected(new Set());
      await loadDetail();
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    const ids = visible.map((it) => it.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected(allOn ? new Set() : new Set(ids));
  }

  if (!batchId) {
    return (
      <div className="space-y-4">
        <section className={cn(ui.card, 'p-4 md:p-5')}>
          <h2 className={cn('text-base font-semibold', ui.title)}>Nuevo lote</h2>
          <p className={cn('mt-1 max-w-2xl text-sm', ui.subtitle)}>
            Pega URLs de producto. El servidor lee las fichas, valida y deja cada una lista para revisar.
            Aprobar crea una oferta pendiente. Publicar sigue en la cola de moderación.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={8}
            placeholder="Pega aquí las URLs o el texto del cazador…"
            className={cn(ui.input, 'mt-2 w-full resize-y px-3 py-2 text-sm')}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void createBatch()}
              className={cn('rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50', ui.chipActive)}
            >
              {busy === 'create' ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Crear lote
            </button>
            <span className={cn('text-xs', ui.muted)}>Hasta {OFFER_BATCH_MAX_ITEMS} enlaces por lote</span>
          </div>
          {banner ? <p className={cn('mt-3 text-sm', ui.soft)}>{banner}</p> : null}
        </section>

        <section className={cn(ui.card, 'p-4 md:p-5')}>
          <h3 className={cn('mb-3 text-sm font-semibold', ui.title)}>Lotes recientes</h3>
          {batches.length === 0 ? (
            <p className={cn('text-sm', ui.muted)}>Aún no hay lotes.</p>
          ) : (
            <ul className="space-y-2">
              {batches.map((row) => (
                <li
                  key={row.id}
                  className={cn('flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3', ui.borderStrong)}
                >
                  <div className="min-w-0">
                    <p className={cn('font-medium', ui.body)}>{row.author_name || 'Usuario'}</p>
                    <p className={cn('mt-0.5 text-xs', ui.muted)}>
                      {new Date(row.created_at).toLocaleString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {row.kinds && row.kinds.length > 0 ? ` · ${row.kinds.join(' · ')}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`${base}/${row.id}?process=1`}
                    className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold', ui.chipActive)}
                  >
                    Abrir lote
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const pendingCount = batch?.pending_items ?? items.filter((it) => it.status === 'INGESTED' || it.status === 'PROCESSING').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={base} className={cn(ui.btnGhost, 'inline-flex items-center gap-1')}>
          <ChevronLeft className="h-4 w-4" /> Lotes
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || pendingCount === 0}
            onClick={() => void processUntilDone()}
            className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50', ui.chipActive)}
          >
            {busy === 'process' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {pendingCount > 0 ? `Procesar (${pendingCount})` : 'Procesado'}
          </button>
          <Link href={pendingHref} className={cn(ui.btnGhost, 'inline-flex items-center')}>
            Ir a la cola
          </Link>
        </div>
      </div>

      <section className={cn(ui.card, 'p-4 md:p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={cn('text-base font-semibold', ui.title)}>{batch?.name || 'Lote'}</h2>
            <p className={cn('mt-1 text-sm tabular-nums', ui.body)}>
              {batch?.total_items ?? items.length} ofertas · {batch?.ready_items ?? 0} listas · {batch?.review_items ?? 0}{' '}
              requieren revisión · {batch?.error_items ?? 0} con error
            </p>
          </div>
          <button type="button" onClick={() => setShowAudit((v) => !v)} className={cn(ui.btnGhost, 'text-xs')}>
            {showAudit ? 'Ocultar auditoría' : 'Ver auditoría'}
          </button>
        </div>
        {banner ? <p className={cn('mt-3 text-sm', ui.soft)}>{banner}</p> : null}
        {bulkNote ? <p className={cn('mt-2 text-sm', ui.body)}>{bulkNote}</p> : null}
      </section>

      {showAudit ? (
        <section className={cn(ui.card, 'max-h-64 overflow-y-auto p-4')}>
          <h3 className={cn('mb-2 text-sm font-semibold', ui.title)}>Auditoría</h3>
          <ul className="space-y-1.5">
            {events.map((ev) => (
              <li key={ev.id} className={cn('text-xs', ui.muted)}>
                {new Date(ev.created_at).toLocaleString('es-MX')} · {ev.action}
                {ev.from_status && ev.to_status
                  ? ` · ${BATCH_ITEM_STATUS_LABEL[ev.from_status as BatchItemStatus] ?? BATCH_STATUS_LABEL[ev.from_status as BatchStatus] ?? ev.from_status} → ${BATCH_ITEM_STATUS_LABEL[ev.to_status as BatchItemStatus] ?? BATCH_STATUS_LABEL[ev.to_status as BatchStatus] ?? ev.to_status}`
                  : ''}
                {ev.payload && typeof ev.payload.old_url === 'string' ? ` · ${ev.payload.old_url} → ${ev.payload.new_url}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-xs font-medium', filter === f.id ? ui.chipActive : ui.btnGhost)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {selected.size > 0 ? (
        <div className={cn('sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-2xl border p-3', ui.card, ui.borderStrong)}>
          <span className={cn('text-sm', ui.body)}>{selected.size} seleccionadas</span>
          <button type="button" disabled={busy !== null} onClick={() => void runBulk('approve')} className={cn(ui.chipActive, 'rounded-full px-3 py-1 text-xs')}>
            Aprobar
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void runBulk('reject')} className={cn(ui.btnGhost, 'text-xs')}>
            Rechazar
          </button>
          <button type="button" disabled={busy !== null} onClick={() => void runBulk('reprocess')} className={cn(ui.btnGhost, 'text-xs')}>
            Reprocesar
          </button>
        </div>
      ) : null}

      <label className={cn('flex items-center gap-2 text-xs', ui.muted)}>
        <input type="checkbox" checked={visible.length > 0 && visible.every((it) => selected.has(it.id))} onChange={toggleVisible} />
        Seleccionar visibles
      </label>

      <ul className="space-y-3">
        {visible.map((item) => (
          <BatchItemCard
            key={item.id}
            item={item}
            ui={ui}
            selected={selected.has(item.id)}
            busy={busy}
            pendingHref={pendingHref}
            onToggle={() => toggle(item.id)}
            onAction={(action, extra) => void runItem(item.id, action, extra)}
          />
        ))}
      </ul>
      {visible.length === 0 ? <p className={cn('text-sm', ui.muted)}>Nada en este filtro.</p> : null}
    </div>
  );
}

function BatchItemCard({
  item,
  ui,
  selected,
  busy,
  pendingHref,
  onToggle,
  onAction,
}: {
  item: OfferBatchItemRow;
  ui: ReturnType<typeof moderationUi>;
  selected: boolean;
  busy: string | null;
  pendingHref: string;
  onToggle: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => void;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [urlEdit, setUrlEdit] = useState(false);
  const [title, setTitle] = useState(item.title ?? '');
  const [store, setStore] = useState(item.store ?? '');
  const [price, setPrice] = useState(item.price != null ? String(item.price) : '');
  const [original, setOriginal] = useState(item.original_price != null ? String(item.original_price) : '');
  const [newUrl, setNewUrl] = useState(item.source_url);

  useEffect(() => {
    setTitle(item.title ?? '');
    setStore(item.store ?? '');
    setPrice(item.price != null ? String(item.price) : '');
    setOriginal(item.original_price != null ? String(item.original_price) : '');
    setNewUrl(item.source_url);
    setImgIdx(0);
    setGalleryOpen(false);
  }, [item.id, item.title, item.store, item.price, item.original_price, item.source_url]);

  const images = item.images ?? [];
  const image = images[imgIdx] ?? images[0] ?? null;
  const canonical = item.canonical_url || item.normalized_url || null;
  const outbound =
    (typeof item.evidence?.outbound_url === 'string' && item.evidence.outbound_url) || item.source_url;
  const shopUrl = outbound || canonical || item.source_url;
  const presented = presentBatchItem({
    status: item.status,
    errorCode: item.error_code,
    warnings: item.warnings ?? [],
    duplicateStatus: item.duplicate_status,
  });
  const foundBy = readAcquisitionAttribution(item.evidence);
  const locked = busy !== null;
  const hasOffer = Boolean(item.offer_id);

  return (
    <li className={cn('rounded-2xl border p-3 md:p-4', ui.card, ui.borderStrong, selected ? ui.rowActive : '')}>
      <div className="flex gap-3">
        <label className="mt-1 shrink-0">
          <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Seleccionar ${item.position}`} />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => image && images.length > 1 && setGalleryOpen(true)}
              className={cn('relative h-20 w-20 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-24', ui.thumbBg)}
              aria-label={images.length > 1 ? `Abrir ${images.length} fotos` : 'Imagen del producto'}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className={cn('flex h-full items-center justify-center px-1 text-center text-[10px]', ui.muted)}>
                  Sin foto
                </span>
              )}
              {images.length > 1 ? (
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">
                  {images.length}
                </span>
              ) : null}
            </button>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', statusTone(item.status, ui))}>
                  {presented.statusLabel}
                </span>
                <span className={cn('text-xs', ui.muted)}>{item.store || item.retailer || 'Tienda'}</span>
                <span className={cn('text-xs tabular-nums', ui.muted)}>#{item.position}</span>
              </div>
              <p className={cn('text-sm font-medium leading-snug', ui.body)}>{item.title || 'Sin título'}</p>
              <p className={cn('text-sm', ui.body)}>
                {money(item.price)}
                {item.original_price != null ? (
                  <span className={cn('ml-2 text-xs line-through', ui.muted)}>{money(item.original_price)}</span>
                ) : null}
                {item.discount_percent != null ? (
                  <span className={cn('ml-2 text-xs font-medium', ui.muted)}>{item.discount_percent}% OFF</span>
                ) : null}
              </p>
              {presented.primaryIssue ? (
                <p className={cn('text-xs', presented.primarySeverity === 'error' ? 'text-red-400' : ui.muted)}>
                  {presented.primaryIssue}
                </p>
              ) : null}
              {foundBy ? (
                <p className={cn('text-xs', ui.muted)}>
                  Fuente {foundBy.sourceKey}
                  {foundBy.scoutName ? ` · ${foundBy.scoutName}` : ''}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {canApproveFrom(item.status) ? (
              <button type="button" disabled={locked} onClick={() => onAction('approve')} className={cn(ui.chipActive, 'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs')}>
                <Check className="h-3.5 w-3.5" /> Aprobar
              </button>
            ) : null}
            {canRejectFrom(item.status) ? (
              <button type="button" disabled={locked} onClick={() => onAction('reject')} className={cn(ui.btnGhost, 'inline-flex items-center gap-1 text-xs')}>
                <X className="h-3.5 w-3.5" /> Rechazar
              </button>
            ) : null}
            {canReprocessFrom(item.status, hasOffer) ? (
              <button type="button" disabled={locked} onClick={() => onAction('reprocess')} className={cn(ui.btnGhost, 'inline-flex items-center gap-1 text-xs')}>
                <RotateCcw className="h-3.5 w-3.5" /> Reprocesar
              </button>
            ) : null}
            {canEditFrom(item.status) ? (
              <button type="button" disabled={locked} onClick={() => setEditing((v) => !v)} className={cn(ui.btnGhost, 'text-xs')}>
                Editar
              </button>
            ) : null}
            {canReprocessFrom(item.status, hasOffer) ? (
              <button type="button" disabled={locked} onClick={() => setUrlEdit((v) => !v)} className={cn(ui.btnGhost, 'text-xs')}>
                Cambiar URL
              </button>
            ) : null}
            <a href={shopUrl} target="_blank" rel="noreferrer" className={cn(ui.btnGhost, 'inline-flex items-center gap-1 text-xs')}>
              <ExternalLink className="h-3.5 w-3.5" /> Abrir producto
            </a>
            {item.offer_id && item.status === 'PUBLISHED' ? (
              <Link href={`/oferta/${item.offer_id}`} className={cn(ui.btnGhost, 'text-xs')}>
                Ver oferta
              </Link>
            ) : null}
            {item.offer_id && item.status === 'APPROVED' ? (
              <Link href={`${pendingHref}?offerId=${item.offer_id}`} className={cn(ui.btnGhost, 'text-xs')}>
                Ver en cola
              </Link>
            ) : null}
          </div>

          {editing ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={cn(ui.input, 'px-2 py-1.5 text-sm')} placeholder="Título" />
              <input value={store} onChange={(e) => setStore(e.target.value)} className={cn(ui.input, 'px-2 py-1.5 text-sm')} placeholder="Tienda" />
              <input value={price} onChange={(e) => setPrice(e.target.value)} className={cn(ui.input, 'px-2 py-1.5 text-sm')} placeholder="Precio actual" inputMode="decimal" />
              <input value={original} onChange={(e) => setOriginal(e.target.value)} className={cn(ui.input, 'px-2 py-1.5 text-sm')} placeholder="Precio anterior" inputMode="decimal" />
              <button
                type="button"
                disabled={locked}
                onClick={() =>
                  onAction('edit', {
                    title,
                    store,
                    price: price ? Number(price) : null,
                    original_price: original ? Number(original) : null,
                  })
                }
                className={cn(ui.chipActive, 'rounded-full px-3 py-1 text-xs')}
              >
                Guardar
              </button>
            </div>
          ) : null}

          {urlEdit ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className={cn(ui.input, 'min-w-0 flex-1 px-2 py-1.5 text-sm')} />
              <button type="button" disabled={locked} onClick={() => onAction('change_url', { url: newUrl })} className={cn(ui.chipActive, 'rounded-full px-3 py-1 text-xs')}>
                Reprocesar URL
              </button>
            </div>
          ) : null}

          <details className="mt-3">
            <summary className={cn('cursor-pointer text-xs', ui.muted)}>Ver detalles</summary>
            <div className={cn('mt-2 space-y-1.5 text-xs', ui.muted)}>
              {presented.details.length === 0 ? <p>Nada que corregir en los datos leídos.</p> : null}
              {presented.details.map((d) => (
                <p key={d.code}>
                  {d.label}
                  {d.hint ? ` — ${d.hint}` : ''}
                </p>
              ))}
              <p className="break-all">Enlace del producto: {canonical || 'sin enlace del producto'}</p>
              <p className="break-all">Enlace que verá la gente: {outbound}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {canonical ? (
                  <button type="button" className={ui.btnGhost} onClick={() => void navigator.clipboard.writeText(canonical)}>
                    Copiar enlace del producto
                  </button>
                ) : null}
                <button type="button" className={ui.btnGhost} onClick={() => void navigator.clipboard.writeText(outbound)}>
                  Copiar enlace público
                </button>
              </div>
            </div>
          </details>
        </div>
      </div>
      {galleryOpen && image ? (
        <div className="mt-3 space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-64 w-full rounded-xl object-contain" />
          <div className="flex flex-wrap gap-1">
            {images.map((src, i) => (
              <button key={src} type="button" onClick={() => setImgIdx(i)} className={cn('h-12 w-12 overflow-hidden rounded-lg', ui.thumbBg, i === imgIdx ? 'ring-2 ring-white' : '')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
