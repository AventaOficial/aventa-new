'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardPaste, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { OFFER_DESCRIPTION_MAX, OFFER_HUNTER_COMMENT_MAX } from '@/lib/contracts/offers';
import {
  batchAffiliatePlan,
  batchAffiliatePlanLabel,
  buildOfferBatchDrafts,
  classifyEnrichmentFailure,
  OFFER_BATCH_MAX,
  type OfferBatchDraft,
} from '@/lib/offers/batchPaste';
import {
  buildLotRowFromDiscoveryAndParse,
  processOfferUrl,
} from '@/lib/offers/ingestion';
import { parseCouponPaste } from '@/lib/intelligence/coupon/parse';
import type { CouponDraft } from '@/lib/intelligence/coupon/types';
import { pendingBasePath, type ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';

type ParseStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'fail';
type CreateStatus = 'idle' | 'loading' | 'ok' | 'dup' | 'error';

type Row = OfferBatchDraft & {
  id: string;
  selected: boolean;
  rawUrl: string;
  image: string;
  images: string[];
  parseStatus: ParseStatus;
  parseNote: string;
  createStatus: CreateStatus;
  createNote: string;
  offerId: string | null;
  outboundUrl: string;
  conflictNote: string;
  readiness: string;
  brand: string;
  discountLabel: string;
  readinessNote: string;
};

function draftsToRows(drafts: OfferBatchDraft[]): Row[] {
  return drafts.map((d, i) => {
    const url = processOfferUrl(d.url, d.store || null);
    return {
      ...d,
      rawUrl: d.url,
      url: url.canonicalUrl || d.url,
      id: `${i}-${url.canonicalUrl || d.url}`,
      selected: true,
      image: d.image,
      images: d.image ? [d.image] : [],
      parseStatus: d.title && d.price ? 'partial' : 'idle',
      parseNote: d.title ? 'Datos del pegado; falta leer la ficha' : '',
      createStatus: 'idle',
      createNote: '',
      offerId: null,
      outboundUrl: url.affiliateUrl || url.canonicalUrl || d.url,
      conflictNote: '',
      readiness: 'discovered',
      brand: '',
      discountLabel: '',
      readinessNote: '',
    };
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function OfferBatchPastePanel({ mode }: { mode: ModerationHubMode }) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  const [paste, setPaste] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [couponDrafts, setCouponDrafts] = useState<CouponDraft[]>([]);
  const [couponNote, setCouponNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<'idle' | 'parse' | 'create'>('idle');
  const [banner, setBanner] = useState<string | null>(null);
  const pendingHref = pendingBasePath(mode);

  const selected = useMemo(() => rows.filter((r) => r.selected), [rows]);
  const ready = selected.filter((r) => r.title.trim() && r.store.trim() && Number(r.price) > 0 && r.url);
  const created = rows.filter((r) => r.createStatus === 'ok').length;

  function detect() {
    setBanner(null);
    const drafts = buildOfferBatchDrafts(paste);
    const parsed = parseCouponPaste(paste);
    setCouponDrafts([...parsed.drafts, ...parsed.failures]);
    const nextRows = drafts.length > 0 ? draftsToRows(drafts) : [];
    setRows(nextRows);
    if (drafts.length === 0 && parsed.drafts.length === 0) {
      setBanner('No encontré URLs ni cupones con código y tienda.');
      setCouponNote(null);
      return;
    }
    setCouponNote(
      parsed.drafts.length > 0
        ? 'Cupones detectados. Guardar no los verifica ni los publica.'
        : null,
    );
    if (drafts.length === 0) setBanner(null);
    else if (nextRows.some((row) => !row.title || !row.price || !row.image)) {
      setBanner('Enlaces listos. Leyendo fichas automáticamente…');
      void enrichRows(nextRows);
    }
  }

  async function enrichRows(targets: Row[]) {
    const headers = await authHeaders();
    if (!headers) return;
    const auth = headers;
    setBusy('parse');
    let ready = 0;
    let partial = 0;
    let blocked = 0;
    let failed = 0;
    let retryable = 0;
    const selected = targets.filter((item) => item.selected);
    const queue = [...selected];
    const workerCount = Math.min(3, queue.length);
    async function takeNext(): Promise<void> {
      const row = queue.shift();
      if (!row) return;
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, parseStatus: 'loading', parseNote: 'Leyendo ficha…' } : r)),
      );
      try {
        const res = await fetch('/api/parse-offer-url', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ url: row.url }),
        });
        const contentType = res.headers.get('content-type') ?? '';
        const internalFailure = res.status >= 500 || contentType.includes('text/html');
        if (res.status === 429 || internalFailure) {
          const fail = classifyEnrichmentFailure(res.status, internalFailure ? 'internal' : 'upstream');
          if (fail.retryable) retryable += 1;
          else failed += 1;
          partial += fail.kind === 'INTERNAL_ERROR' ? 0 : 1;
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    parseStatus: fail.kind === 'INTERNAL_ERROR' ? 'fail' : 'partial',
                    parseNote: fail.message,
                  }
                : r,
            ),
          );
          if (res.status === 429) await sleep(2500);
          await takeNext();
          return;
        }
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const built = buildLotRowFromDiscoveryAndParse({
          discovery: {
            rawUrl: row.rawUrl || row.url,
            title: row.title || null,
            store: row.store || null,
            price: row.price ? Number(row.price) : null,
            originalPrice: row.originalPrice ? Number(row.originalPrice) : null,
            image: row.image || null,
            seller: row.seller || null,
            availability: row.availability || null,
            why: row.why || null,
            source: 'paste',
          },
          parseData: data,
          pdpAttempted: true,
        });
        const conflictNote = built.merged.conflictNote;
        if (built.quality.readiness === 'blocked') blocked += 1;
        else if (built.quality.readyForReview && built.merged.conflicts.length === 0) ready += 1;
        else partial += 1;
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  title: built.merged.title.value ?? r.title,
                  store: built.merged.store.value ?? r.store,
                  price:
                    built.merged.price.value != null ? String(built.merged.price.value) : r.price,
                  originalPrice:
                    built.merged.originalPrice.value != null
                      ? String(built.merged.originalPrice.value)
                      : r.originalPrice,
                  image: built.merged.image.value ?? '',
                  images: built.merged.images,
                  seller: built.merged.seller.value ?? '',
                  availability: built.merged.availability.value ?? '',
                  brand: built.merged.brand.value ?? '',
                  discountLabel:
                    built.merged.discount != null ? `${built.merged.discount}%` : '',
                  outboundUrl: built.url.affiliateUrl || built.url.canonicalUrl || r.url,
                  url: built.url.canonicalUrl || r.url,
                  conflictNote,
                  readiness: built.quality.readiness,
                  readinessNote: [
                    built.summary.checks.map((item) => `✓ ${item}`).join(' '),
                    built.summary.warnings.map((item) => `⚠ ${item}`).join(' '),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  parseStatus: built.quality.readyForReview
                    ? built.merged.conflicts.length > 0
                      ? 'partial'
                      : 'ok'
                    : 'partial',
                  parseNote:
                    conflictNote ||
                    (built.quality.readyForReview
                      ? `Ficha ${built.quality.readiness}`
                      : `Falta: ${[...built.quality.requiredMissing, ...built.quality.strongMissing].join(', ') || 'revisión'}`),
                }
              : r,
          ),
        );
      } catch {
        retryable += 1;
        failed += 1;
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  parseStatus: r.title && r.price ? 'partial' : 'fail',
                  parseNote: 'Error de red. Se puede reintentar.',
                }
              : r,
          ),
        );
      }
      await takeNext();
    }
    await Promise.all(Array.from({ length: workerCount }, () => takeNext()));
    setBusy('idle');
    setBanner(
      `TOTAL ${selected.length} · READY ${ready} · PARTIAL ${partial} · BLOCKED ${blocked} · FAILED ${failed} · RETRYABLE ${retryable}`,
    );
  }

  async function saveReviewedCoupons() {
    const headers = await authHeaders();
    if (!headers) return;
    const acceptKeys = couponDrafts.filter((draft) => draft.ok && draft.canonicalKey).map((draft) => draft.canonicalKey as string);
    if (acceptKeys.length === 0) return;
    setBusy('create');
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: paste, sourceClass: 'user_paste', acceptKeys }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('idle');
    setCouponNote(res.ok ? `Guardados: ${data.saved?.length ?? 0}. Siguen sin verificar.` : 'No se pudo guardar. Si falta la migración, aplícala primero.');
  }

  async function authHeaders(): Promise<Record<string, string> | null> {
    const token = session?.access_token;
    if (!token) {
      setBanner('Inicia sesión para leer fichas y crear pendientes.');
      return null;
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async function readPages() {
    await enrichRows(rows.filter((r) => r.selected));
  }

  async function createPending() {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy('create');
    setBanner(null);
    const targets = rows.filter(
      (r) => r.selected && r.createStatus !== 'ok' && r.title.trim() && r.store.trim() && Number(r.price) > 0,
    );
    if (targets.length === 0) {
      setBanner('Marca al menos una fila con título, tienda y precio.');
      setBusy('idle');
      return;
    }
    for (const row of targets) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, createStatus: 'loading', createNote: 'Creando pendiente…' } : r)),
      );
      const price = Number(row.price);
      const original = row.originalPrice.trim() ? Number(row.originalPrice) : undefined;
      const hasDiscount = original != null && Number.isFinite(original) && original > price;
      const why = row.why.trim().slice(0, OFFER_HUNTER_COMMENT_MAX);
      const description = (why || 'Oferta cargada por lote. Revisar ficha antes de aprobar.').slice(
        0,
        OFFER_DESCRIPTION_MAX,
      );
      try {
        const res = await fetch('/api/admin/offer-batch/item', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: row.title.trim(),
            store: row.store.trim(),
            hasDiscount,
            price,
            original_price: hasDiscount ? original : null,
            offer_url: row.rawUrl || row.url,
            image_url: row.image || '/placeholder.png',
            image_urls: row.images.slice(0, 8),
            description,
            ...(why ? { hunter_comment: why } : {}),
            ...(row.seller.trim() ? { seller: row.seller.trim() } : {}),
            ...(row.availability.trim() ? { availability: row.availability.trim() } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? {
                    ...r,
                    selected: false,
                    createStatus: 'dup',
                    createNote: 'Ya existía en Aventa',
                    offerId: typeof data.duplicate_offer_id === 'string' ? data.duplicate_offer_id : null,
                  }
                : r,
            ),
          );
          continue;
        }
        if (!res.ok) {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, createStatus: 'error', createNote: data.error || 'No se pudo crear' }
                : r,
            ),
          );
          continue;
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  selected: false,
                  createStatus: 'ok',
                  createNote: 'Pendiente creada',
                  offerId: typeof data.id === 'string' ? data.id : null,
                }
              : r,
          ),
        );
      } catch {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, createStatus: 'error', createNote: 'Error de red' } : r)),
        );
      }
    }
    setBusy('idle');
  }

  function patch(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-4">
      <section className={cn(ui.card, 'p-4 md:p-5')}>
        <div className="mb-3 flex items-start gap-3">
          <div className={cn('mt-0.5 rounded-xl p-2', ui.heroBg)}>
            <ClipboardPaste className={cn('h-5 w-5', ui.iconSoft)} />
          </div>
          <div>
            <h2 className={cn('text-base font-semibold', ui.title)}>Subir ofertas por lote</h2>
            <p className={cn('mt-1 max-w-2xl text-sm', ui.subtitle)}>
              Pega URLs de <strong>producto</strong> (no hace falta el link afiliado). Amazon y Mercado Libre se
              etiquetan al crear. Otras tiendas con programa se pegan en la cola, como siempre, antes de aprobar.
              Entran a <strong>pending</strong>. El formulario de la app no cambia.
            </p>
          </div>
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={10}
          placeholder="Pega aquí las 20 URLs o el texto completo del cazador…"
          className={cn(ui.input, 'w-full resize-y px-3 py-2 text-sm')}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={detect}
            className={cn('rounded-full px-4 py-2 text-sm font-medium', ui.chipActive)}
          >
            Revisar pegado
          </button>
          <span className={cn('text-xs', ui.muted)}>Máximo {OFFER_BATCH_MAX} por pegado</span>
        </div>
        {banner ? <p className={cn('mt-3 text-sm', ui.soft)}>{banner}</p> : null}
      </section>

      {couponDrafts.length > 0 ? (
        <section className={cn(ui.card, 'p-4 md:p-5')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm', ui.body)}>{couponNote}</p>
            <button
              type="button"
              disabled={busy !== 'idle'}
              onClick={() => void saveReviewedCoupons()}
              className={cn('rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50', ui.chipActive)}
            >
              Guardar cupones revisados
            </button>
          </div>
          <ul className="space-y-2">
            {couponDrafts.map((draft) => (
              <li key={draft.canonicalKey ?? draft.raw.slice(0, 40)} className={cn('text-sm', ui.body)}>
                {draft.ok
                  ? `${draft.store} · ${draft.code} · ${draft.discountType} · por verificar`
                  : draft.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className={cn(ui.card, 'p-4 md:p-5')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm', ui.body)}>
              {rows.length} enlaces · {selected.length} marcadas · {ready.length} listas para crear
              {created > 0 ? ` · ${created} pendientes nuevas` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== 'idle'}
                onClick={() => void readPages()}
                className={cn(ui.btnGhost, 'inline-flex items-center gap-1.5 disabled:opacity-50')}
              >
                {busy === 'parse' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Leer fichas
              </button>
              <button
                type="button"
                disabled={busy !== 'idle'}
                onClick={() => void createPending()}
                className={cn('inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium disabled:opacity-50', ui.chipActive)}
              >
                {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Crear pendientes
              </button>
              <Link href={pendingHref} className={cn(ui.btnGhost, 'inline-flex items-center')}>
                Ir a la cola
              </Link>
            </div>
          </div>

          <ul className="space-y-3">
            {rows.map((row, idx) => (
              <li key={row.id} className={cn('rounded-xl border p-3', ui.borderStrong, ui.rowHover)}>
                <div className="flex gap-3">
                  <label className="mt-1 shrink-0">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={row.createStatus === 'ok'}
                      onChange={(e) => patch(row.id, { selected: e.target.checked })}
                      aria-label={`Incluir oferta ${idx + 1}`}
                    />
                  </label>
                  <div className={cn('h-16 w-16 shrink-0 overflow-hidden rounded-lg', ui.thumbBg)}>
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.image} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={cn('text-xs tabular-nums', ui.muted)}>{idx + 1}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px]', ui.heroBg, ui.muted)}>
                        {batchAffiliatePlanLabel(batchAffiliatePlan(row.url))}
                      </span>
                      <span className={cn('text-xs', ui.muted)}>{row.parseNote || row.createNote}</span>
                    </div>
                    <input
                      value={row.title}
                      onChange={(e) => patch(row.id, { title: e.target.value })}
                      placeholder="Título"
                      className={cn(ui.input, 'w-full px-2 py-1.5 text-sm')}
                    />
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      <input
                        value={row.store}
                        onChange={(e) => patch(row.id, { store: e.target.value })}
                        placeholder="Tienda"
                        className={cn(ui.input, 'px-2 py-1.5 text-sm')}
                      />
                      <input
                        value={row.price}
                        onChange={(e) => patch(row.id, { price: e.target.value })}
                        placeholder="Precio actual"
                        inputMode="decimal"
                        className={cn(ui.input, 'px-2 py-1.5 text-sm')}
                      />
                      <input
                        value={row.originalPrice}
                        onChange={(e) => patch(row.id, { originalPrice: e.target.value })}
                        placeholder="Precio anterior"
                        inputMode="decimal"
                        className={cn(ui.input, 'px-2 py-1.5 text-sm')}
                      />
                      <a
                        href={row.outboundUrl || row.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn('truncate px-2 py-1.5 text-xs underline', ui.soft)}
                      >
                        Abrir
                      </a>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cn(ui.btnGhost, 'rounded-full px-3 py-1 text-xs')}
                        onClick={() => {
                          void navigator.clipboard.writeText(row.outboundUrl || row.url);
                        }}
                      >
                        Copiar outbound
                      </button>
                      <button
                        type="button"
                        className={cn(ui.btnGhost, 'rounded-full px-3 py-1 text-xs')}
                        onClick={() => {
                          void navigator.clipboard.writeText(row.url);
                        }}
                      >
                        Copiar canónica
                      </button>
                      {row.seller ? <span className={cn('text-xs', ui.muted)}>Vendido por {row.seller}</span> : null}
                      {row.availability ? <span className={cn('text-xs', ui.muted)}>{row.availability}</span> : null}
                      {row.discountLabel ? <span className={cn('text-xs', ui.muted)}>{row.discountLabel}</span> : null}
                      {row.conflictNote ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">{row.conflictNote}</span>
                      ) : null}
                      {row.readinessNote ? <span className={cn('text-xs', ui.muted)}>{row.readinessNote}</span> : null}
                    </div>
                    {row.why ? <p className={cn('text-xs', ui.muted)}>{row.why}</p> : null}
                    {row.offerId ? (
                      <p className={cn('text-xs', ui.muted)}>id {row.offerId}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
