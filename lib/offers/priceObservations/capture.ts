import type { SupabaseClient } from '@supabase/supabase-js';
import { acquireIngestCycleLock, releaseIngestCycleLock } from '@/lib/bots/ingest/ingestCycleLock';
import { classifyDespensaText } from '@/lib/despensa/classify';
import { despensaHostOf, despensaSourceForUrl } from '@/lib/despensa/sources';
import { resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';
import {
  createMercadoLibreCaptureAdapter,
  type CaptureCandidate,
  type PriceCaptureAdapter,
  type ReadFailure,
  type SourceReading,
} from './adapters';
import { readPriceCaptureConfig, type PriceCaptureConfig } from './config';
import {
  anchorKey,
  captureSourceIdOf,
  identityKey,
  observationIdempotencyKey,
  ONLINE_NATIONAL_SCOPE,
  readProduct,
  resolveCaptureItem,
  scopeKey,
} from './identity';
import {
  isActiveCaptureSource,
  isMissingColumnError,
  PRICE_OBSERVATION_POLICY as P,
  toPrice,
  type ActiveCaptureSourceId,
  type StoredObservationRow,
  type ValidationStatus,
} from './policy';
import { readProductObservations } from './read';
import { validateCapturedObservation } from './validate';

export const PRICE_CAPTURE_LOCK_KEY = 'despensa_price_capture';

export type CaptureSkipReason =
  | 'not_despensa'
  | 'invalid_offer_price'
  | 'currency_not_mxn'
  | 'source_unknown'
  | 'source_not_supported'
  | 'source_retired'
  | 'source_not_in_config'
  | 'source_disabled'
  | 'source_not_configured'
  | 'item_id_unresolved'
  | 'catalog_without_item'
  | 'tracking_window_ended'
  | 'same_product_other_offer'
  | 'captured_recently'
  | 'recent_capture_check_failed'
  | 'over_source_cap'
  | 'over_run_cap'
  | 'prior_history_unavailable'
  | 'duplicate_idempotent'
  | 'insert_failed'
  | ReadFailure;

export type CaptureEvent = {
  offerId: string;
  sourceId: string | null;
  outcome: 'inserted' | 'skipped';
  reason: CaptureSkipReason | ValidationStatus;
};

export type PriceCaptureReport = {
  runId: string;
  status: 'disabled' | 'schema_missing' | 'skipped_concurrent' | 'failed' | 'completed';
  detail: string | null;
  dryRun: boolean;
  policyVersion: string;
  startedAt: string;
  durationMs: number;
  budgetMs: number;
  budgetExhausted: boolean;
  pool: number;
  selected: number;
  attempted: number;
  inserted: Record<ValidationStatus, number>;
  skipped: Partial<Record<CaptureSkipReason, number>>;
  perSource: Partial<Record<ActiveCaptureSourceId, { selected: number; inserted: number; failed: number }>>;
  /** Productos seleccionados cuya oferta ancla ya caducó (seguimiento después de la caducidad). */
  trackedAfterExpiry: number;
  /** Motivo por oferta (sin `not_despensa`, que es la mayoría del feed). Máximo 200. */
  events: CaptureEvent[];
};

export type PriceCaptureDeps = {
  supabase: SupabaseClient;
  adapters?: readonly PriceCaptureAdapter[];
  clock?: () => number;
  runId?: string;
  config?: PriceCaptureConfig;
  log?: (line: string) => void;
  /** Lee y valida sin escribir nada (ni observaciones ni lock). `inserted` cuenta lo que se habría guardado. */
  dryRun?: boolean;
};

type OfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  original_price: number | string | null;
  offer_url: string | null;
  product_fingerprint: string | null;
  source_currency: string | null;
  expires_at: string | null;
};

const MAX_EVENTS = 200;
const RECENT_CHECK_CHUNK = 100;

export function defaultPriceCaptureAdapters(): PriceCaptureAdapter[] {
  return [createMercadoLibreCaptureAdapter()];
}

function newRunId(clock: () => number): string {
  try {
    return `pc_${globalThis.crypto.randomUUID()}`;
  } catch {
    return `pc_${clock().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Captura periódica de precios de Canasta Básica.
 *
 * - Apagada salvo `app_config.despensa_price_capture = { "enabled": true }`.
 * - Solo fuentes con API oficial vigente (Mercado Libre). Amazon PA-API está retirada y sus
 *   ofertas se omiten con `source_retired`; las demás tiendas, con `source_not_supported`.
 *   No hay scraping.
 * - Observa productos, no ofertas: una observación por item externo y ventana de 24 h, anclada
 *   a la oferta vigente más nueva del producto. Si todas caducaron, el producto se sigue
 *   observando `trackingDaysAfterExpiry` días más.
 * - Solo escribe en `offer_price_snapshots` (source = capture). Nunca crea, publica ni
 *   modifica ofertas.
 * - Idempotente por `idempotency_key` (índice único); dos corridas simultáneas chocan en el
 *   lock y, si el lock falla abierto, en el índice.
 * - Cada candidato está aislado: una falla de tienda no detiene a las demás.
 */
export async function runPriceCaptureCycle(deps: PriceCaptureDeps): Promise<PriceCaptureReport> {
  const clock = deps.clock ?? (() => Date.now());
  const startedMs = clock();
  const runId = deps.runId ?? newRunId(clock);
  const log = deps.log ?? ((line: string) => console.log(line));
  const supabase = deps.supabase;
  const adapters = deps.adapters ?? defaultPriceCaptureAdapters();

  const report: PriceCaptureReport = {
    runId,
    status: 'completed',
    detail: null,
    dryRun: deps.dryRun === true,
    policyVersion: P.version,
    startedAt: new Date(startedMs).toISOString(),
    durationMs: 0,
    budgetMs: 0,
    budgetExhausted: false,
    pool: 0,
    selected: 0,
    attempted: 0,
    inserted: { valid: 0, quarantined: 0, invalid: 0, superseded: 0 },
    skipped: {},
    perSource: {},
    trackedAfterExpiry: 0,
    events: [],
  };
  const finish = (status: PriceCaptureReport['status'], detail: string | null = null): PriceCaptureReport => {
    report.status = status;
    report.detail = detail;
    report.durationMs = clock() - startedMs;
    const { events, ...summary } = report;
    log(`[price-capture] ${JSON.stringify({ ...summary, eventsLogged: events.length, events: events.slice(0, 50) })}`);
    return report;
  };
  const skip = (offerId: string, sourceId: string | null, reason: CaptureSkipReason, record = true) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
    if (record && report.events.length < MAX_EVENTS) report.events.push({ offerId, sourceId, outcome: 'skipped', reason });
  };

  const config = deps.config ?? (await readPriceCaptureConfig(supabase));
  report.budgetMs = config.budgetMs;
  if (!config.enabled) return finish('disabled', config.disabledReason);

  const probe = await supabase.from('offer_price_snapshots').select('id, validation_status, idempotency_key, policy_version').limit(1);
  if (probe.error) {
    return isMissingColumnError(probe.error) ? finish('schema_missing', 'migration 20261012 not applied') : finish('failed', 'schema_probe_failed');
  }

  const work = () => captureWithLock({ supabase, adapters, clock, config, report, skip, runId, startedMs, finish, dryRun: report.dryRun });
  if (report.dryRun) {
    try {
      return await work();
    } catch {
      return finish('failed', 'unexpected_error');
    }
  }

  const lock = await acquireIngestCycleLock({
    lockKey: PRICE_CAPTURE_LOCK_KEY,
    supabase,
    now: new Date(startedMs),
    ttlMs: Math.max(5 * 60_000, config.budgetMs + 60_000),
  });
  if (!lock.acquired) return finish('skipped_concurrent', 'lock_held');

  try {
    return await work();
  } catch {
    return finish('failed', 'unexpected_error');
  } finally {
    await releaseIngestCycleLock({ lockKey: PRICE_CAPTURE_LOCK_KEY, holder: lock.holder, supabase, now: new Date(clock()) });
  }
}

async function captureWithLock(ctx: {
  supabase: SupabaseClient;
  adapters: readonly PriceCaptureAdapter[];
  clock: () => number;
  config: PriceCaptureConfig;
  report: PriceCaptureReport;
  skip: (offerId: string, sourceId: string | null, reason: CaptureSkipReason, record?: boolean) => void;
  runId: string;
  startedMs: number;
  finish: (status: PriceCaptureReport['status'], detail?: string | null) => PriceCaptureReport;
  dryRun: boolean;
}): Promise<PriceCaptureReport> {
  const { supabase, adapters, clock, config, report, skip, runId, startedMs, finish, dryRun } = ctx;
  const deadlineMs = startedMs + config.budgetMs;
  const now = new Date(startedMs);

  const pool = await supabase
    .from('offers')
    .select('id, title, price, original_price, offer_url, product_fingerprint, source_currency, expires_at')
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(config.candidatePool);
  if (pool.error) return finish('failed', 'candidate_query_failed');
  const trackingFloor = startedMs - P.trackingDaysAfterExpiry * 86_400_000;
  const offers = ((pool.data ?? []) as OfferRow[]).filter((o) => {
    const exp = o.expires_at ? Date.parse(o.expires_at) : NaN;
    if (!Number.isFinite(exp) || exp >= trackingFloor) return true;
    skip(o.id, null, 'tracking_window_ended', false);
    return false;
  });
  report.pool = offers.length;

  const adapterBySource = new Map(adapters.map((a) => [a.sourceId, a]));
  // Un candidato por producto: la oferta vigente más nueva; si todas caducaron, la más nueva.
  const byAnchor = new Map<string, CaptureCandidate>();
  for (const o of offers) {
    const title = o.title?.trim() ?? '';
    if (!classifyDespensaText(title)) {
      skip(o.id, null, 'not_despensa', false);
      continue;
    }
    const source = despensaSourceForUrl(o.offer_url);
    const sourceId = source?.id ?? null;
    const price = toPrice(o.price);
    if (price == null || !(price > 0)) {
      skip(o.id, sourceId, 'invalid_offer_price');
      continue;
    }
    if (resolveOfferSourceCurrency(o.source_currency, o.offer_url) !== 'MXN') {
      skip(o.id, sourceId, 'currency_not_mxn');
      continue;
    }
    if (!source) {
      skip(o.id, null, 'source_unknown');
      continue;
    }
    const captureId = captureSourceIdOf(source.id);
    if (captureId && !isActiveCaptureSource(captureId)) {
      skip(o.id, source.id, 'source_retired');
      continue;
    }
    const adapter = captureId ? adapterBySource.get(captureId) : undefined;
    if (!adapter) {
      skip(o.id, source.id, 'source_not_supported');
      continue;
    }
    if (!config.sources.includes(adapter.sourceId)) {
      skip(o.id, source.id, 'source_not_in_config');
      continue;
    }
    const st = adapter.status();
    if (!st.enabled) {
      skip(o.id, source.id, st.reason);
      continue;
    }
    const item = resolveCaptureItem(adapter.sourceId, { offerUrl: o.offer_url, productFingerprint: o.product_fingerprint });
    if (!item.ok) {
      skip(o.id, source.id, item.reason);
      continue;
    }
    const exp = o.expires_at ? Date.parse(o.expires_at) : NaN;
    const original = toPrice(o.original_price);
    const candidate: CaptureCandidate = {
      offerId: o.id,
      title,
      price,
      originalPrice: original != null && original > 0 ? original : null,
      offerUrl: o.offer_url ?? '',
      sourceId: adapter.sourceId,
      externalItemId: item.externalItemId,
      catalogProductId: item.catalogProductId,
      canonicalUrl: item.canonicalUrl,
      storeHost: despensaHostOf(o.offer_url),
      anchorExpired: Number.isFinite(exp) && exp < startedMs,
    };
    const key = anchorKey(candidate);
    const held = byAnchor.get(key);
    if (held && !(held.anchorExpired && !candidate.anchorExpired)) {
      skip(o.id, source.id, 'same_product_other_offer', false);
      continue;
    }
    if (held) skip(held.offerId, held.sourceId, 'same_product_other_offer', false);
    byAnchor.set(key, candidate);
  }
  const eligible = [...byAnchor.values()];

  // Productos capturados hace poco: una consulta por cada 100 items. Si falla, no se captura a ciegas.
  const recentSince = new Date(startedMs - config.minHoursBetweenCaptures * 3_600_000).toISOString();
  const recent = new Set<string>();
  let recentFailed = false;
  for (let i = 0; i < eligible.length && !recentFailed; i += RECENT_CHECK_CHUNK) {
    const chunk = eligible.slice(i, i + RECENT_CHECK_CHUNK);
    for (const sourceId of new Set(chunk.map((c) => c.sourceId))) {
      const { data, error } = await supabase
        .from('offer_price_snapshots')
        .select('source_id, external_item_id')
        .eq('source', 'capture')
        .eq('source_id', sourceId)
        .in(
          'external_item_id',
          chunk.filter((c) => c.sourceId === sourceId).map((c) => c.externalItemId),
        )
        .gte('recorded_at', recentSince);
      if (error) recentFailed = true;
      for (const r of (data ?? []) as { source_id: string; external_item_id: string }[]) recent.add(`${r.source_id}:${r.external_item_id}`);
    }
  }

  const selected: CaptureCandidate[] = [];
  const perSourceCount = new Map<ActiveCaptureSourceId, number>();
  for (const c of eligible) {
    if (recentFailed) {
      skip(c.offerId, c.sourceId, 'recent_capture_check_failed');
      continue;
    }
    if (recent.has(anchorKey(c))) {
      skip(c.offerId, c.sourceId, 'captured_recently');
      continue;
    }
    const n = perSourceCount.get(c.sourceId) ?? 0;
    if (n >= config.maxPerSource[c.sourceId]) {
      skip(c.offerId, c.sourceId, 'over_source_cap');
      continue;
    }
    if (selected.length >= config.maxCandidates) {
      skip(c.offerId, c.sourceId, 'over_run_cap');
      continue;
    }
    perSourceCount.set(c.sourceId, n + 1);
    selected.push(c);
  }
  report.selected = selected.length;
  report.trackedAfterExpiry = selected.filter((c) => c.anchorExpired).length;
  for (const [sourceId, n] of perSourceCount) report.perSource[sourceId] = { selected: n, inserted: 0, failed: 0 };
  if (selected.length === 0) return finish('completed', 'no_candidates');

  const history = await readProductObservations(supabase, selected, { now });
  const ready = selected.filter((c) => {
    if (history.byAnchor.get(anchorKey(c))?.complete) return true;
    skip(c.offerId, c.sourceId, 'prior_history_unavailable');
    return false;
  });

  for (const adapter of adapters) {
    const batch = ready.filter((c) => c.sourceId === adapter.sourceId);
    if (batch.length === 0) continue;
    const stats = report.perSource[adapter.sourceId]!;
    if (clock() >= deadlineMs) {
      report.budgetExhausted = true;
      for (const c of batch) skip(c.offerId, c.sourceId, 'time_budget_exhausted');
      continue;
    }
    let readings: Map<string, SourceReading>;
    try {
      readings = await adapter.read(batch, { clock, deadlineMs });
    } catch {
      readings = new Map();
    }
    for (const c of batch) {
      const reading = readings.get(c.offerId) ?? { ok: false as const, reason: 'source_error' as const, httpStatus: null };
      if (!reading.ok) {
        if (reading.reason === 'time_budget_exhausted') report.budgetExhausted = true;
        stats.failed += 1;
        skip(c.offerId, c.sourceId, reading.reason);
        continue;
      }
      report.attempted += 1;
      const status = await persistReading({
        supabase,
        candidate: c,
        reading,
        prior: history.byAnchor.get(anchorKey(c))?.rows ?? [],
        now: new Date(clock()),
        runId,
        dryRun,
      });
      if (status.ok) {
        report.inserted[status.validation] += 1;
        stats.inserted += 1;
        if (report.events.length < 200) report.events.push({ offerId: c.offerId, sourceId: c.sourceId, outcome: 'inserted', reason: status.validation });
      } else {
        skip(c.offerId, c.sourceId, status.reason);
      }
    }
  }
  return finish('completed');
}

/** Construye, valida e inserta una observación. No toca ninguna otra tabla. */
async function persistReading(args: {
  supabase: SupabaseClient;
  candidate: CaptureCandidate;
  reading: Extract<SourceReading, { ok: true }>;
  prior: readonly StoredObservationRow[];
  now: Date;
  runId: string;
  dryRun: boolean;
}): Promise<{ ok: true; validation: ValidationStatus } | { ok: false; reason: 'duplicate_idempotent' | 'insert_failed' }> {
  const { candidate: c, reading: r } = args;
  const offerReading = readProduct(c.title);
  const observedReading = r.observedTitle ? readProduct(r.observedTitle) : null;
  const presentation = observedReading?.presentationKey ?? offerReading.presentationKey;
  const needId = observedReading?.needId ?? offerReading.needId;
  const variantId = observedReading?.variantId ?? offerReading.variantId;
  const scope = ONLINE_NATIONAL_SCOPE;
  const identity = identityKey({ sourceId: c.sourceId, externalItemId: c.externalItemId, needId, variantId, presentationKey: presentation });

  const sameSeries = args.prior
    .filter((p) => p.identity_key === identity && scopeKey({ kind: p.scope_kind ?? 'unknown', label: p.scope_label ?? null }) === scopeKey(scope))
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at))
    .flatMap((p) => {
      const price = toPrice(p.price);
      if (price == null || p.availability === 'out_of_stock' || p.currency !== 'MXN') return [];
      return [{ price, recordedAt: p.recorded_at, status: p.validation_status ?? null, reasons: p.validation_reasons ?? [] }];
    });

  const validation = validateCapturedObservation(
    {
      price: r.price,
      currency: r.currency,
      observedAt: r.observedAt,
      availability: r.availability,
      scopeKind: scope.kind,
      observed: observedReading,
      offer: offerReading,
    },
    sameSeries,
    args.now,
  );

  const observedMs = Date.parse(r.observedAt);
  const row = {
    offer_id: c.offerId,
    price: r.price,
    original_price: r.listPrice,
    source: 'capture',
    recorded_at: r.observedAt,
    currency: r.currency,
    canonical_url: r.canonicalUrl,
    store_host: c.storeHost,
    source_id: c.sourceId,
    external_item_id: c.externalItemId,
    identity_key: identity,
    presentation_key: presentation,
    need_id: needId,
    variant_id: variantId,
    scope_kind: scope.kind,
    scope_label: scope.label,
    availability: r.availability,
    capture_method: r.method,
    validation_status: validation.status,
    validation_reasons: validation.reasons,
    validated_at: args.now.toISOString(),
    policy_version: P.version,
    idempotency_key: observationIdempotencyKey({
      sourceId: c.sourceId,
      externalItemId: c.externalItemId,
      scope,
      observedAtMs: Number.isFinite(observedMs) ? observedMs : args.now.getTime(),
    }),
    capture_run_id: args.runId,
    provenance: {
      detail: r.detail,
      http_status: r.httpStatus,
      catalog_product_id: c.catalogProductId,
      anchor_offer_expired: c.anchorExpired,
      observed_title: r.observedTitle ? r.observedTitle.slice(0, 200) : null,
      presentation_from: observedReading?.presentationKey ? 'source_title' : offerReading.presentationKey ? 'offer_title' : null,
      offer_price_at_capture: c.price,
      offer_list_price_at_capture: c.originalPrice,
      list_price_origin: r.listPrice != null ? 'source_same_moment' : null,
      previous_valid_price: sameSeries.find((p) => p.status === 'valid')?.price ?? null,
    },
  };

  if (args.dryRun) return { ok: true, validation: validation.status };
  const { error } = await args.supabase.from('offer_price_snapshots').insert(row);
  if (!error) return { ok: true, validation: validation.status };
  if (error.code === '23505' || /duplicate key/i.test(error.message ?? '')) return { ok: false, reason: 'duplicate_idempotent' };
  return { ok: false, reason: 'insert_failed' };
}
