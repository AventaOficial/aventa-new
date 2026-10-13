import {
  fetchAmazonPaapiItems,
  PAAPI_MAX_ITEMS_PER_REQUEST,
  type AmazonPaapiCredentials,
  type PaapiItem,
} from '@/lib/bots/ingest/amazonPaapi';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { fetchMercadoLibreItemsMulti, type MlItemApiBody } from '@/lib/bots/ingest/mlItemDetails';
import { resolveMercadoLibrePrice, type MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';
import { round2, type CaptureMethod, type CaptureSourceId, type ObservedAvailability } from './policy';

export type CaptureCandidate = {
  offerId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  offerUrl: string;
  sourceId: CaptureSourceId;
  externalItemId: string;
  canonicalUrl: string | null;
  storeHost: string | null;
};

export type ReadFailure =
  | 'price_unavailable'
  | 'item_not_found'
  | 'source_unauthorized'
  | 'source_error'
  | 'source_circuit_open'
  | 'time_budget_exhausted';

export type SourceReading =
  | {
      ok: true;
      /** Hora exacta en que la fuente respondió. */
      observedAt: string;
      price: number;
      listPrice: number | null;
      currency: string | null;
      availability: ObservedAvailability;
      observedTitle: string | null;
      canonicalUrl: string | null;
      method: CaptureMethod;
      /** Endpoint o recurso concreto que dio el precio. */
      detail: string;
      httpStatus: number | null;
    }
  | { ok: false; reason: ReadFailure; httpStatus: number | null };

export type AdapterContext = { clock: () => number; deadlineMs: number };

export type PriceCaptureAdapter = {
  sourceId: CaptureSourceId;
  /** Si la fuente está habilitada por su propia configuración. Nunca enciende nada. */
  status(): { enabled: true } | { enabled: false; reason: 'source_disabled' | 'source_not_configured' };
  read(candidates: readonly CaptureCandidate[], ctx: AdapterContext): Promise<Map<string, SourceReading>>;
};

/** Fallas seguidas de una tienda que abren el cortocircuito para el resto de la corrida. */
const CIRCUIT_FAILURES = 3;

// ── Mercado Libre: API oficial ───────────────────────────────────────────

export type MercadoLibreAdapterDeps = {
  fetchItems: (ids: string[]) => Promise<Map<string, MlItemApiBody>>;
  resolvePrice: (input: { itemId: string; bypassCache?: boolean }) => Promise<MercadoLibrePriceResolution>;
};

function mlAvailability(body: MlItemApiBody | undefined): ObservedAvailability {
  if (!body) return 'unknown';
  if (body.status && body.status !== 'active') return 'out_of_stock';
  if (typeof body.available_quantity === 'number') {
    if (body.available_quantity <= 0) return 'out_of_stock';
    return body.available_quantity <= 3 ? 'limited' : 'in_stock';
  }
  return 'unknown';
}

const ML_FAILURE: Record<Exclude<MercadoLibrePriceResolution['status'], 'resolved'>, ReadFailure> = {
  unavailable: 'price_unavailable',
  not_found: 'item_not_found',
  unauthorized: 'source_unauthorized',
  error: 'source_error',
};

export function createMercadoLibreCaptureAdapter(
  deps: MercadoLibreAdapterDeps = { fetchItems: fetchMercadoLibreItemsMulti, resolvePrice: resolveMercadoLibrePrice },
): PriceCaptureAdapter {
  return {
    sourceId: 'mercadolibre_mx',
    status: () => ({ enabled: true }),
    async read(candidates, ctx) {
      const out = new Map<string, SourceReading>();
      if (candidates.length === 0) return out;
      let details = new Map<string, MlItemApiBody>();
      try {
        details = await deps.fetchItems(candidates.map((c) => c.externalItemId));
      } catch {
        details = new Map();
      }
      let consecutiveFailures = 0;
      for (const c of candidates) {
        if (consecutiveFailures >= CIRCUIT_FAILURES) {
          out.set(c.offerId, { ok: false, reason: 'source_circuit_open', httpStatus: null });
          continue;
        }
        if (ctx.clock() >= ctx.deadlineMs) {
          out.set(c.offerId, { ok: false, reason: 'time_budget_exhausted', httpStatus: null });
          continue;
        }
        let res: MercadoLibrePriceResolution;
        try {
          res = await deps.resolvePrice({ itemId: c.externalItemId, bypassCache: true });
        } catch {
          consecutiveFailures += 1;
          out.set(c.offerId, { ok: false, reason: 'source_error', httpStatus: null });
          continue;
        }
        if (res.status !== 'resolved' || res.price == null) {
          const reason = res.status === 'resolved' ? 'price_unavailable' : ML_FAILURE[res.status];
          if (reason === 'source_error' || reason === 'source_unauthorized') consecutiveFailures += 1;
          else consecutiveFailures = 0;
          out.set(c.offerId, { ok: false, reason, httpStatus: res.httpStatus });
          continue;
        }
        consecutiveFailures = 0;
        const body = details.get(c.externalItemId);
        const list = res.originalPrice ?? res.regularPrice ?? null;
        out.set(c.offerId, {
          ok: true,
          observedAt: new Date(ctx.clock()).toISOString(),
          price: round2(res.price),
          listPrice: list != null && list > res.price ? round2(list) : null,
          currency: res.currency ?? body?.currency_id ?? null,
          availability: mlAvailability(body),
          observedTitle: body?.title?.trim() || null,
          canonicalUrl: body?.permalink?.trim() || c.canonicalUrl,
          method: 'ml_official_api',
          detail: res.resolvedBy ?? res.source,
          httpStatus: res.httpStatus,
        });
      }
      return out;
    },
  };
}

// ── Amazon México: PA-API ────────────────────────────────────────────────

export type AmazonAdapterDeps = {
  loadConfig: () => Pick<BotIngestConfig, 'amazonPaapiEnabled' | 'amazonSource'> & AmazonPaapiCredentials;
  fetchItems: typeof fetchAmazonPaapiItems;
};

const AMAZON_RESOURCES = ['ItemInfo.Title', 'Offers.Listings.Price', 'Offers.Listings.Availability.Type'] as const;

function amazonAvailability(type: string | undefined): ObservedAvailability {
  const t = (type ?? '').toLowerCase();
  if (t === 'now') return 'in_stock';
  if (t.includes('outofstock') || t === 'unavailable') return 'out_of_stock';
  return 'unknown';
}

function readPaapiItem(item: PaapiItem | undefined, c: CaptureCandidate, observedAt: string): SourceReading {
  const listing = item?.Offers?.Listings?.[0];
  const amount = listing?.Price?.Amount;
  if (!item) return { ok: false, reason: 'item_not_found', httpStatus: 200 };
  if (typeof amount !== 'number' || !(amount > 0)) return { ok: false, reason: 'price_unavailable', httpStatus: 200 };
  const savings = listing?.Price?.Savings?.Amount;
  return {
    ok: true,
    observedAt,
    price: round2(amount),
    listPrice: typeof savings === 'number' && savings > 0 ? round2(amount + savings) : null,
    currency: listing?.Price?.Currency?.trim().toUpperCase() || null,
    availability: amazonAvailability(listing?.Availability?.Type),
    observedTitle: item.ItemInfo?.Title?.DisplayValue?.trim() || null,
    canonicalUrl: c.canonicalUrl,
    method: 'amazon_paapi',
    detail: 'paapi_getitems',
    httpStatus: 200,
  };
}

export function createAmazonCaptureAdapter(deps: AmazonAdapterDeps): PriceCaptureAdapter {
  const enabledBy = () => {
    const cfg = deps.loadConfig();
    if (!cfg.amazonPaapiEnabled || cfg.amazonSource !== 'paapi') return { cfg, enabled: false as const, reason: 'source_disabled' as const };
    if (!cfg.amazonPaapiAccessKey || !cfg.amazonPaapiSecretKey || !cfg.amazonPaapiPartnerTag) {
      return { cfg, enabled: false as const, reason: 'source_not_configured' as const };
    }
    return { cfg, enabled: true as const };
  };
  return {
    sourceId: 'amazon_mx',
    status() {
      const s = enabledBy();
      return s.enabled ? { enabled: true } : { enabled: false, reason: s.reason };
    },
    async read(candidates, ctx) {
      const out = new Map<string, SourceReading>();
      const s = enabledBy();
      if (!s.enabled) return out;
      let failures = 0;
      for (let i = 0; i < candidates.length; i += PAAPI_MAX_ITEMS_PER_REQUEST) {
        const batch = candidates.slice(i, i + PAAPI_MAX_ITEMS_PER_REQUEST);
        if (failures >= 1) {
          for (const c of batch) out.set(c.offerId, { ok: false, reason: 'source_circuit_open', httpStatus: null });
          continue;
        }
        if (ctx.clock() >= ctx.deadlineMs) {
          for (const c of batch) out.set(c.offerId, { ok: false, reason: 'time_budget_exhausted', httpStatus: null });
          continue;
        }
        const res = await deps.fetchItems(s.cfg, batch.map((c) => c.externalItemId), AMAZON_RESOURCES).catch(
          () => ({ ok: false as const, reason: 'network_error' as const, httpStatus: null }),
        );
        if (!res.ok) {
          failures += 1;
          const reason: ReadFailure = res.httpStatus === 401 || res.httpStatus === 403 ? 'source_unauthorized' : 'source_error';
          for (const c of batch) out.set(c.offerId, { ok: false, reason, httpStatus: res.httpStatus });
          continue;
        }
        const observedAt = new Date(ctx.clock()).toISOString();
        const byAsin = new Map(res.items.map((it) => [it.ASIN?.trim().toUpperCase() ?? '', it]));
        for (const c of batch) out.set(c.offerId, readPaapiItem(byAsin.get(c.externalItemId), c, observedAt));
      }
      return out;
    },
  };
}
