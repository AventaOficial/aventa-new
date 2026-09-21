/**
 * Sticky observation canónica vía server/API (NO Playwright PDP).
 * Reutiliza resolveMercadoLibrePrice + enrichParsedOffer + Price Memory.
 * Nunca inventa título/imagen/precio/original.
 */

import { sleep } from '@/lib/bots/ingest/ingestHttp';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { applyCanonicalDiscountToMetaFields } from '@/lib/bots/ingest/canonicalDiscount';
import {
  computeMlPriceIntel,
  loadMlDailyHistory,
  normalizeMlProductId,
  recordMlDailySnapshots,
  ML_PRICE_TZ,
} from '@/lib/bots/ingest/mlPriceEngine';
import { applyMlPriceIntelToMeta } from '@/lib/bots/ingest/priceIntel';
import { formatYmdInTz } from '@/lib/bots/ingest/ingestZonedTime';
import { fetchMlApi, type FetchMlApiResult } from '@/lib/integrations/mercadolibre/apiClient';
import { createServerClient } from '@/lib/supabase/server';
import { enrichParsedOfferMetadata } from '@/lib/hunter/enrichment/enrichParsedOffer';
import { firstValidOfferImage, isValidOfferImage } from '@/lib/hunter/enrichment/isValidOfferImage';
import { resolveMercadoLibreItem } from '@/lib/offers/resolveMercadoLibreItem';
import {
  resolveMercadoLibrePrice,
  type MercadoLibrePriceResolution,
  type MercadoLibrePriceSource,
} from '@/lib/offers/resolveMercadoLibrePrice';
import { toSupplyCandidate } from './candidate';
import { resolveStickyNicheBudget } from './stickyBudgets';
import {
  selectStickySkuTargets,
  selectStickySkuTargetsWithReport,
  type StickySkuSelectReport,
  type StickySkuTarget,
} from './stickySku';
import type { SupplyCandidate } from './types';

export type StickyObservationStatus =
  | 'ok'
  | 'insufficient_evidence'
  | 'source_blocked'
  | 'not_found'
  | 'price_unverified'
  | 'error';

export type StickyPricedField = {
  value: number;
  source: string;
  observedAt: string;
};

export type StickyServerObservation = {
  itemId: string;
  title: string | null;
  price: StickyPricedField | null;
  originalPrice: StickyPricedField | null;
  currency: string | null;
  imageUrl: string | null;
  offerUrl: string;
  category: string | null;
  store: string;
  provenance: Record<string, string>;
  observedAt: string;
  observationStatus: StickyObservationStatus;
  /** Meta lista para el pipeline Supply (null si no hay precio verificado). */
  meta: ParsedOfferMetadata | null;
};

export type StickyFunnelCounters = {
  stickyCandidates: number;
  stickyDiscovered: number;
  /** Alias semántico: seleccionados para la ola del nicho. */
  stickySelected: number;
  stickyObserved: number;
  stickyFailed: number;
  stickySkippedCooldown: number;
  cooldownSkipped: number;
  qualitySkipped: number;
  duplicateSkipped: number;
  budgetLimited: number;
  allowlistSize: number;
  /** @deprecated alias de stickyApiAttempted — sticky ya no usa Playwright PDP */
  pdpAttempted: number;
  /** @deprecated alias de stickyApiSuccess */
  pdpSuccess: number;
  stickyApiAttempted: number;
  stickyApiSuccess: number;
  stickyApiBlocked: number;
  stickyNotFound: number;
  stickyPriceVerified: number;
  stickyEvidenceRich: number;
  evidenceRich: number;
  snapshotOnly: number;
};

export type StickyObserveReport = StickyFunnelCounters & {
  candidates: SupplyCandidate[];
  targets: StickySkuTarget[];
  observations: StickyServerObservation[];
  selection: StickySkuSelectReport | null;
};

export function permalinkFromMlItemId(itemId: string): string {
  const compact = itemId.replace(/-/g, '').toUpperCase();
  const m = /^(ML[A-Z]{0,3})(\d+)$/i.exec(compact);
  if (!m) return `https://articulo.mercadolibre.com.mx/${compact}`;
  return `https://articulo.mercadolibre.com.mx/${m[1]!.toUpperCase()}-${m[2]}`;
}

export function isStickyEvidenceRich(meta: ParsedOfferMetadata): boolean {
  const title = (meta.title ?? '').trim();
  const titleOk = title.length >= 8 && !/^Mercado Libre ML/i.test(title);
  const imageOk = isValidOfferImage(meta.imageUrl);
  const priceOk = Number.isFinite(meta.discountPrice) && meta.discountPrice > 0;
  const originalOk =
    meta.originalPrice != null &&
    Number.isFinite(meta.originalPrice) &&
    meta.originalPrice > meta.discountPrice;
  return titleOk && imageOk && priceOk && originalOk;
}

function emptyReport(): StickyObserveReport {
  return {
    stickyCandidates: 0,
    stickyDiscovered: 0,
    stickySelected: 0,
    stickyObserved: 0,
    stickyFailed: 0,
    stickySkippedCooldown: 0,
    cooldownSkipped: 0,
    qualitySkipped: 0,
    duplicateSkipped: 0,
    budgetLimited: 0,
    allowlistSize: 0,
    pdpAttempted: 0,
    pdpSuccess: 0,
    stickyApiAttempted: 0,
    stickyApiSuccess: 0,
    stickyApiBlocked: 0,
    stickyNotFound: 0,
    stickyPriceVerified: 0,
    stickyEvidenceRich: 0,
    evidenceRich: 0,
    snapshotOnly: 0,
    candidates: [],
    targets: [],
    observations: [],
    selection: null,
  };
}

function mapPriceStatus(status: MercadoLibrePriceResolution['status']): StickyObservationStatus {
  if (status === 'unauthorized') return 'source_blocked';
  if (status === 'not_found') return 'not_found';
  if (status === 'unavailable' || status === 'error') return 'price_unverified';
  return 'price_unverified';
}

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

type StickyResolvedQuote = {
  current: number;
  originalPrice: number | null;
  regularPrice: number | null;
  currency: string | null;
  source: MercadoLibrePriceSource;
  confidence: 'high' | 'medium' | 'low';
  listingItemId: string | null;
  titleHint: string | null;
  imageHint: string | null;
  categoryId: string | null;
  offerUrlHint: string | null;
};

type ProductsApiFailure = {
  ok: false;
  status: StickyObservationStatus;
  httpStatus: number | null;
  reason: string;
};

type ProductsApiSuccess = { ok: true; quote: StickyResolvedQuote };

/**
 * Canal server validado por discovery highlights:
 * GET /products/{id} + GET /products/{id}/items
 * (Price Memory sticky guarda mayormente catalog product IDs; /items/{id}/prices → 404/403).
 * No inventa: solo campos explícitos de la API. No toma “el primero” a ciegas —
 * prioriza listing con precio+original (mismo criterio que collectListingsFromHighlights).
 */
export async function resolveStickyViaProductsApi(
  productId: string,
  fetchApi: typeof fetchMlApi = fetchMlApi,
): Promise<ProductsApiSuccess | ProductsApiFailure> {
  const productRes = await fetchApi(`/products/${encodeURIComponent(productId)}`);
  const itemsRes = await fetchApi(`/products/${encodeURIComponent(productId)}/items`);

  const blocked = (r: FetchMlApiResult) => !r.ok && (r.status === 401 || r.status === 403);
  if (blocked(itemsRes) && (blocked(productRes) || !productRes.ok)) {
    return {
      ok: false,
      status: 'source_blocked',
      httpStatus: !itemsRes.ok ? itemsRes.status : !productRes.ok ? productRes.status : null,
      reason: 'products_api_blocked',
    };
  }
  if (!itemsRes.ok) {
    if (blocked(itemsRes)) {
      return {
        ok: false,
        status: 'source_blocked',
        httpStatus: itemsRes.status,
        reason: 'products_items_blocked',
      };
    }
    if (itemsRes.status === 404 && (!productRes.ok || productRes.status === 404)) {
      return {
        ok: false,
        status: 'not_found',
        httpStatus: 404,
        reason: 'products_not_found',
      };
    }
    return {
      ok: false,
      status: 'price_unverified',
      httpStatus: !itemsRes.ok ? itemsRes.status : null,
      reason: `products_items_http:${itemsRes.status}`,
    };
  }

  const results =
    (itemsRes.data as { results?: Array<Record<string, unknown>> } | null)?.results ?? [];

  type Listing = {
    itemId: string;
    price: number;
    originalPrice: number | null;
    currency: string | null;
    categoryId: string | null;
  };
  const listings: Listing[] = [];
  for (const row of results) {
    const itemIdRaw =
      typeof row.item_id === 'string'
        ? row.item_id
        : typeof row.id === 'string'
          ? row.id
          : null;
    const itemId = itemIdRaw ? itemIdRaw.replace(/-/g, '').toUpperCase() : null;
    const price = finitePositive(row.price);
    if (!itemId || price == null) continue;
    const originalRaw = finitePositive(row.original_price);
    listings.push({
      itemId,
      price,
      originalPrice: originalRaw != null && originalRaw > price ? originalRaw : null,
      currency: typeof row.currency_id === 'string' ? row.currency_id : null,
      categoryId: typeof row.category_id === 'string' ? row.category_id : null,
    });
  }

  // Mismo filtro que highlights discovery: preferir evidencia con original verificable.
  const withOriginal = listings.find((l) => l.originalPrice != null && l.originalPrice > l.price);
  const picked = withOriginal ?? listings[0] ?? null;
  if (!picked) {
    return {
      ok: false,
      status: 'price_unverified',
      httpStatus: itemsRes.status,
      reason: 'products_items_empty_prices',
    };
  }

  let titleHint: string | null = null;
  let imageHint: string | null = null;
  if (productRes.ok && productRes.data && typeof productRes.data === 'object') {
    const pdata = productRes.data as {
      name?: string;
      pictures?: Array<{ url?: string; secure_url?: string }>;
    };
    titleHint = typeof pdata.name === 'string' ? pdata.name.trim() || null : null;
    const pics = (pdata.pictures ?? [])
      .map((p) => (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://').trim())
      .filter(Boolean);
    imageHint = firstValidOfferImage(pics);
  }

  return {
    ok: true,
    quote: {
      current: picked.price,
      originalPrice: picked.originalPrice,
      regularPrice: picked.originalPrice,
      currency: picked.currency,
      source: 'products_items',
      confidence: 'high',
      listingItemId: picked.itemId,
      titleHint,
      imageHint,
      categoryId: picked.categoryId,
      offerUrlHint: permalinkFromMlItemId(picked.itemId),
    },
  };
}

async function lookupOfferMeta(
  productId: string,
  supabase: ReturnType<typeof createServerClient> | null,
): Promise<{ title: string; imageUrl: string } | null> {
  if (!supabase) return null;
  const needle = productId.replace(/-/g, '');
  try {
    const { data } = await supabase
      .from('offers')
      .select('title, image_url, url')
      .ilike('url', `%${needle.slice(-10)}%`)
      .order('created_at', { ascending: false })
      .limit(3);
    for (const row of data ?? []) {
      const url = String((row as { url?: string }).url ?? '');
      if (!url.toUpperCase().includes(needle.toUpperCase()) && !url.includes(productId)) continue;
      const title = String((row as { title?: string }).title ?? '').trim();
      if (title.length < 3) continue;
      return {
        title,
        imageUrl: String((row as { image_url?: string | null }).image_url ?? ''),
      };
    }
  } catch {
    /* optional */
  }
  return null;
}

export type ObserveStickySkuViaServerDeps = {
  resolvePrice?: typeof resolveMercadoLibrePrice;
  enrichMeta?: typeof enrichParsedOfferMetadata;
  lookupMeta?: typeof lookupOfferMeta;
  loadHistory?: typeof loadMlDailyHistory;
  recordSnapshots?: typeof recordMlDailySnapshots;
  /** Inyectable para tests; default fetchMlApi (OAuth). */
  fetchApi?: typeof fetchMlApi;
};

/**
 * Una observación sticky canónica: Price Memory SKU → API precio → enrich → meta.
 * No Playwright. No inventa campos ausentes.
 *
 * Orden:
 * 1) resolveMercadoLibrePrice (/items/.../prices|sale_price)
 * 2) si unavailable → /products/{id} + /products/{id}/items (canal highlights)
 * unauthorized/not_found del paso 1 se respetan fail-closed (sin inventar fallback).
 */
export async function observeStickySkuViaServer(opts: {
  productId: string;
  nicheId: string;
  persistSnapshots: boolean;
  observedAt?: Date;
  target?: StickySkuTarget | null;
  supabase?: ReturnType<typeof createServerClient> | null;
  deps?: ObserveStickySkuViaServerDeps;
}): Promise<StickyServerObservation> {
  const observedAt = (opts.observedAt ?? new Date()).toISOString();
  const productId = normalizeMlProductId(opts.productId) ?? opts.productId.replace(/-/g, '').toUpperCase();
  const permalink = permalinkFromMlItemId(productId);
  const resolved = resolveMercadoLibreItem(permalink);
  const offerUrl = resolved?.canonicalUrl || permalink;

  const base: StickyServerObservation = {
    itemId: productId,
    title: null,
    price: null,
    originalPrice: null,
    currency: null,
    imageUrl: null,
    offerUrl,
    category: null,
    store: 'Mercado Libre',
    provenance: { channel: 'server_api', mode: 'sticky' },
    observedAt,
    observationStatus: 'error',
    meta: null,
  };

  const resolvePrice = opts.deps?.resolvePrice ?? resolveMercadoLibrePrice;
  const enrichMeta = opts.deps?.enrichMeta ?? enrichParsedOfferMetadata;
  const lookupMeta = opts.deps?.lookupMeta ?? lookupOfferMeta;
  const loadHistory = opts.deps?.loadHistory ?? loadMlDailyHistory;
  const recordSnapshots = opts.deps?.recordSnapshots ?? recordMlDailySnapshots;
  const fetchApi = opts.deps?.fetchApi ?? fetchMlApi;

  let quote: StickyResolvedQuote | null = null;

  let priceRes: MercadoLibrePriceResolution;
  try {
    priceRes = await resolvePrice({
      itemId: productId,
      catalogProductId: resolved?.catalogProductId ?? null,
      siteId: resolved?.siteId ?? null,
      bypassCache: true,
    });
  } catch {
    return { ...base, observationStatus: 'error', provenance: { ...base.provenance, error: 'resolve_threw' } };
  }

  base.provenance.priceApiStatus = priceRes.status;
  base.provenance.priceApiSource = priceRes.source;
  base.currency = priceRes.currency;

  if (priceRes.status === 'resolved' && priceRes.price != null && priceRes.price > 0) {
    quote = {
      current: priceRes.price,
      originalPrice:
        priceRes.originalPrice != null && priceRes.originalPrice > priceRes.price
          ? priceRes.originalPrice
          : priceRes.regularPrice != null && priceRes.regularPrice > priceRes.price
            ? priceRes.regularPrice
            : null,
      regularPrice: priceRes.regularPrice,
      currency: priceRes.currency,
      source: priceRes.source,
      confidence: priceRes.confidence,
      listingItemId: null,
      titleHint: null,
      imageHint: null,
      categoryId: null,
      offerUrlHint: null,
    };
  } else if (priceRes.status === 'unauthorized' || priceRes.status === 'not_found') {
    return {
      ...base,
      observationStatus: mapPriceStatus(priceRes.status),
      provenance: {
        ...base.provenance,
        reason: `price_status:${priceRes.status}`,
        httpStatus: String(priceRes.httpStatus ?? ''),
      },
    };
  } else {
    // unavailable/error → canal products (catalog / UPP sticky IDs en Price Memory)
    const viaProducts = await resolveStickyViaProductsApi(productId, fetchApi);
    if (!viaProducts.ok) {
      return {
        ...base,
        observationStatus: viaProducts.status,
        provenance: {
          ...base.provenance,
          reason: viaProducts.reason,
          httpStatus: String(viaProducts.httpStatus ?? priceRes.httpStatus ?? ''),
          itemsPriceStatus: priceRes.status,
        },
      };
    }
    quote = viaProducts.quote;
    base.provenance.priceApiSource = quote.source;
    base.provenance.priceApiStatus = 'resolved';
    base.currency = quote.currency;
  }

  const current = quote.current;
  const apiOriginal = quote.originalPrice;

  if (opts.persistSnapshots) {
    await recordSnapshots([
      {
        productId,
        current,
        listPrice: apiOriginal,
        regularPrice: quote.regularPrice,
        nicheId: opts.nicheId,
      },
    ]);
  }

  const history = await loadHistory(productId);
  const today = formatYmdInTz(opts.observedAt ?? new Date(), ML_PRICE_TZ);
  const intel = computeMlPriceIntel(
    {
      current,
      listPrice: apiOriginal,
      regularPrice: quote.regularPrice,
    },
    history,
    today,
  );

  const offerMeta = await lookupMeta(productId, opts.supabase ?? null);
  const applied = applyCanonicalDiscountToMetaFields({
    salePrice: current,
    originalPrice: apiOriginal,
    existingDiscountPercent: null,
    recordShadow: false,
  });
  const discountPercent = applied.discountPercent;

  const titleSeed = (quote.titleHint ?? offerMeta?.title ?? '').trim();
  const imageSeed = quote.imageHint || offerMeta?.imageUrl || '';
  const canonical =
    quote.offerUrlHint ||
    (resolved?.canonicalUrl && resolved.canonicalUrl.includes('-') ? resolved.canonicalUrl : null) ||
    offerUrl;

  let meta: ParsedOfferMetadata = {
    canonicalUrl: canonical,
    title: titleSeed,
    store: 'Mercado Libre',
    imageUrl: imageSeed,
    discountPrice: current,
    originalPrice: apiOriginal,
    discountPercent,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: apiOriginal != null ? 'source_explicit' : 'unknown',
      discountPercentProvenance: discountPercent != null ? 'derived' : 'unknown',
      categoryId: quote.categoryId,
    },
  };

  meta = applyMlPriceIntelToMeta(
    meta,
    {
      quote: {
        current,
        listPrice: apiOriginal,
        regularPrice: quote.regularPrice,
      },
      intel,
    },
    { preserveLabelDiscount: true },
  );

  const enriched = await enrichMeta(meta, {
    source: 'ml_api',
    sourceDetail: `ml:sticky:${productId}|niche:${opts.nicheId}|mode:sticky|src:${quote.source}`,
    skipHtml: isValidOfferImage(meta.imageUrl) && (meta.title?.trim().length ?? 0) >= 10,
  });
  meta = enriched.meta;

  const title = (meta.title ?? '').trim() || null;
  const imageUrl = isValidOfferImage(meta.imageUrl) ? meta.imageUrl.trim() : null;
  // No inventar: si enrich no trajo original, no usar histórico del target.
  const original =
    meta.originalPrice != null && meta.originalPrice > meta.discountPrice
      ? meta.originalPrice
      : null;

  meta = {
    ...meta,
    originalPrice: original,
    discountPercent: applyCanonicalDiscountToMetaFields({
      salePrice: meta.discountPrice,
      originalPrice: original,
      existingDiscountPercent: meta.discountPercent,
      recordShadow: false,
    }).discountPercent,
    imageUrl: imageUrl ?? '',
    title: title ?? '',
  };

  const pricedCurrent: StickyPricedField = {
    value: meta.discountPrice,
    source: `ml_api:${quote.source}`,
    observedAt,
  };
  const pricedOriginal: StickyPricedField | null =
    original != null
      ? { value: original, source: `ml_api:${quote.source}`, observedAt }
      : null;

  const rich = isStickyEvidenceRich(meta);
  const hasTitle = Boolean(title && title.length >= 8);

  return {
    itemId: productId,
    title,
    price: pricedCurrent,
    originalPrice: pricedOriginal,
    currency: quote.currency ?? 'MXN',
    imageUrl,
    offerUrl: meta.canonicalUrl || offerUrl,
    category: meta.signals?.categoryId ?? quote.categoryId,
    store: 'Mercado Libre',
    provenance: {
      ...base.provenance,
      priceSource: quote.source,
      priceConfidence: quote.confidence,
      listingItemId: quote.listingItemId ?? '',
      enrichChanged: String(enriched.changed),
      evidenceRich: String(rich),
    },
    observedAt,
    observationStatus: rich || hasTitle ? (rich ? 'ok' : 'insufficient_evidence') : 'insufficient_evidence',
    meta: hasTitle ? meta : null,
  };
}

/**
 * Observa un lote sticky: selection → observeStickySkuViaServer → candidatos DQE.
 */
export async function observeStickySkus(opts: {
  config: BotIngestConfig;
  nicheId: string;
  persistSnapshots: boolean;
  maxTargets?: number;
  supabase?: ReturnType<typeof createServerClient> | null;
  now?: Date;
  /** Override de selección (tests). Si se omite, usa selectStickySkuTargetsWithReport niche-aware. */
  selectTargets?: typeof selectStickySkuTargets;
  selectTargetsWithReport?: typeof selectStickySkuTargetsWithReport;
  /** @deprecated prefer deps.resolvePrice — mantenido para tests legacy */
  fetchQuote?: (itemId: string, fallback: { current: number; listPrice: number | null }) => Promise<{
    current: number;
    listPrice: number | null;
    regularPrice: number | null;
  }>;
  enrichMeta?: typeof enrichParsedOfferMetadata;
  deps?: ObserveStickySkuViaServerDeps;
}): Promise<StickyObserveReport> {
  const report = emptyReport();

  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      client = null;
    }
  }

  const nicheBudget = resolveStickyNicheBudget(opts.nicheId);
  const maxTargets =
    opts.maxTargets ??
    Math.min(opts.config.mlMaxCollect, nicheBudget || 0);

  let targets: StickySkuTarget[] = [];
  if (opts.selectTargetsWithReport) {
    const selection = await opts.selectTargetsWithReport({
      nicheId: opts.nicheId,
      supabase: client,
      now: opts.now,
      config: { maxTargets },
    });
    report.selection = selection;
    targets = selection.targets;
    report.cooldownSkipped = selection.cooldownSkipped;
    report.stickySkippedCooldown = selection.cooldownSkipped;
    report.qualitySkipped = selection.qualitySkipped;
    report.duplicateSkipped = selection.duplicateSkipped;
    report.budgetLimited = selection.budgetLimited;
    report.allowlistSize = selection.allowlistSize;
  } else if (opts.selectTargets) {
    targets = await opts.selectTargets({
      nicheId: opts.nicheId,
      supabase: client,
      now: opts.now,
      config: { maxTargets },
    });
  } else {
    const selection = await selectStickySkuTargetsWithReport({
      nicheId: opts.nicheId,
      supabase: client,
      now: opts.now,
      config: { maxTargets },
    });
    report.selection = selection;
    targets = selection.targets;
    report.cooldownSkipped = selection.cooldownSkipped;
    report.stickySkippedCooldown = selection.cooldownSkipped;
    report.qualitySkipped = selection.qualitySkipped;
    report.duplicateSkipped = selection.duplicateSkipped;
    report.budgetLimited = selection.budgetLimited;
    report.allowlistSize = selection.allowlistSize;
  }

  report.targets = targets;
  report.stickyCandidates = targets.length;
  report.stickyDiscovered = targets.length;
  report.stickySelected = targets.length;
  if (targets.length === 0) return report;

  const legacyFetchQuote = opts.fetchQuote;
  const resolvePriceDep: typeof resolveMercadoLibrePrice | undefined = legacyFetchQuote
    ? async (input) => {
        const q = await legacyFetchQuote(input.itemId, {
          current: 0,
          listPrice: null,
        });
        if (!(q.current > 0)) {
          return {
            status: 'unavailable',
            price: null,
            originalPrice: null,
            regularPrice: null,
            promotionPrice: null,
            currency: null,
            source: 'none',
            confidence: 'low',
            resolvedBy: null,
            httpStatus: null,
          };
        }
        return {
          status: 'resolved',
          price: q.current,
          originalPrice: q.listPrice,
          regularPrice: q.regularPrice,
          promotionPrice: null,
          currency: 'MXN',
          source: 'items_prices',
          confidence: 'medium',
          resolvedBy: 'items_prices',
          httpStatus: 200,
        };
      }
    : opts.deps?.resolvePrice;

  for (const target of targets) {
    const productId = normalizeMlProductId(target.productId);
    if (!productId) {
      report.stickyFailed += 1;
      continue;
    }

    report.stickyApiAttempted += 1;
    report.pdpAttempted += 1;

    try {
      const obs = await observeStickySkuViaServer({
        productId,
        nicheId: opts.nicheId,
        persistSnapshots: opts.persistSnapshots,
        observedAt: opts.now,
        target,
        supabase: client,
        deps: {
          resolvePrice: resolvePriceDep,
          enrichMeta: opts.enrichMeta ?? opts.deps?.enrichMeta,
          lookupMeta: opts.deps?.lookupMeta,
          loadHistory: opts.deps?.loadHistory,
          recordSnapshots: opts.deps?.recordSnapshots,
          fetchApi: opts.deps?.fetchApi,
        },
      });
      report.observations.push(obs);

      if (obs.observationStatus === 'source_blocked') {
        report.stickyApiBlocked += 1;
        report.stickyFailed += 1;
        continue;
      }
      if (obs.observationStatus === 'not_found') {
        report.stickyNotFound += 1;
        report.stickyFailed += 1;
        continue;
      }
      if (obs.observationStatus === 'price_unverified' || obs.observationStatus === 'error' || !obs.price) {
        report.stickyFailed += 1;
        continue;
      }

      // Precio API verificado (explícito). No confundir con evidence-rich.
      report.stickyApiSuccess += 1;
      report.pdpSuccess += 1;
      report.stickyPriceVerified += 1;
      report.stickyObserved += 1;

      if (!obs.meta) {
        report.snapshotOnly += 1;
        await sleep(120);
        continue;
      }

      if (isStickyEvidenceRich(obs.meta)) {
        report.stickyEvidenceRich += 1;
        report.evidenceRich += 1;
      }

      report.candidates.push(
        toSupplyCandidate({
          item: {
            url: obs.meta.canonicalUrl,
            source: 'ml_api',
            sourceDetail: `ml:sticky:${productId}|niche:${opts.nicheId}|mode:sticky`,
            precomputedMeta: obs.meta,
          },
          hunterSourceId: 'ml_api_legacy',
          sourceId: 'ml_api_legacy',
          sourceFamily: 'official_api',
          sourceType: 'official_api',
        }),
      );
      await sleep(120);
    } catch {
      report.stickyFailed += 1;
    }
  }

  return report;
}
