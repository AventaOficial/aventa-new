import { fetchMercadoLibreItemsMulti, type MlItemApiBody } from '@/lib/bots/ingest/mlItemDetails';
import { resolveMercadoLibrePrice, type MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';
import { round2, type ActiveCaptureSourceId, type CaptureMethod, type ObservedAvailability } from './policy';

export type CaptureCandidate = {
  /** Oferta que ancla la observación (la más nueva del producto). */
  offerId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  offerUrl: string;
  sourceId: ActiveCaptureSourceId;
  externalItemId: string;
  /** Producto de catálogo de Mercado Libre al que pertenece el item, si la URL lo declara. */
  catalogProductId: string | null;
  canonicalUrl: string | null;
  storeHost: string | null;
  /** La oferta ancla ya caducó; el producto sigue en seguimiento. */
  anchorExpired: boolean;
};

/**
 * Por qué una fuente no dio precio. `source_unauthorized` y `source_rate_limited` no son
 * errores del item; `source_error` es transitorio (5xx, red, tiempo de espera).
 */
export type ReadFailure =
  | 'price_unavailable'
  | 'item_not_found'
  | 'source_unauthorized'
  | 'source_rate_limited'
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
  sourceId: ActiveCaptureSourceId;
  /** Si la fuente está habilitada por su propia configuración. Nunca enciende nada. */
  status(): { enabled: true } | { enabled: false; reason: 'source_disabled' | 'source_not_configured' };
  read(candidates: readonly CaptureCandidate[], ctx: AdapterContext): Promise<Map<string, SourceReading>>;
};

/**
 * Límites por corrida. Ninguno apaga la fuente de forma permanente: la siguiente corrida
 * vuelve a intentar desde cero.
 * - `unauthorizedInARow`: respuestas 401/403 seguidas que cierran la fuente en esta corrida.
 * - `errorsInARow`: fallas transitorias seguidas (ya reintentadas) que la cierran.
 * - `transientRetries`: reintentos por item ante una falla transitoria.
 * - Un 429 la cierra de inmediato: la tienda pidió bajar el ritmo.
 */
export const ML_CAPTURE_LIMITS = { unauthorizedInARow: 3, errorsInARow: 3, transientRetries: 1 } as const;

// ── Mercado Libre: API oficial ───────────────────────────────────────────

export type MercadoLibreAdapterDeps = {
  fetchItems: (ids: string[]) => Promise<Map<string, MlItemApiBody>>;
  resolvePrice: (input: { itemId: string; catalogProductId?: string | null; bypassCache?: boolean }) => Promise<MercadoLibrePriceResolution>;
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

function isoCurrency(v: string | null | undefined): string | null {
  const c = v?.trim().toUpperCase();
  return c && /^[A-Z]{3}$/.test(c) ? c : null;
}

/**
 * Clasifica una resolución sin precio. `resolveMercadoLibrePrice` devuelve `unavailable` para
 * casi todo, así que manda el código HTTP del primer endpoint. Un 200 sin precio legible es
 * una respuesta incompleta (`price_unavailable`), no una falla de la fuente.
 */
export function classifyMlFailure(res: Pick<MercadoLibrePriceResolution, 'status' | 'httpStatus'>): ReadFailure {
  const http = res.httpStatus;
  if (res.status === 'unauthorized' || http === 401 || http === 403) return 'source_unauthorized';
  if (http === 429) return 'source_rate_limited';
  if (res.status === 'not_found' || http === 404) return 'item_not_found';
  if (res.status === 'error' || (http != null && http >= 500) || http === 0) return 'source_error';
  return 'price_unavailable';
}

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
      let unauthorized = 0;
      let errors = 0;
      let closed = false;
      for (const c of candidates) {
        if (closed) {
          out.set(c.offerId, { ok: false, reason: 'source_circuit_open', httpStatus: null });
          continue;
        }
        if (ctx.clock() >= ctx.deadlineMs) {
          out.set(c.offerId, { ok: false, reason: 'time_budget_exhausted', httpStatus: null });
          continue;
        }
        let res: MercadoLibrePriceResolution | null = null;
        let failure: ReadFailure | null = null;
        for (let attempt = 0; attempt <= ML_CAPTURE_LIMITS.transientRetries; attempt += 1) {
          if (attempt > 0 && ctx.clock() >= ctx.deadlineMs) break;
          try {
            res = await deps.resolvePrice({ itemId: c.externalItemId, catalogProductId: c.catalogProductId, bypassCache: true });
            failure = res.status === 'resolved' && res.price != null ? null : classifyMlFailure(res);
          } catch {
            res = null;
            failure = 'source_error';
          }
          if (failure !== 'source_error') break;
        }

        if (failure || !res || res.price == null) {
          const reason = failure ?? 'price_unavailable';
          out.set(c.offerId, { ok: false, reason, httpStatus: res?.httpStatus ?? null });
          unauthorized = reason === 'source_unauthorized' ? unauthorized + 1 : 0;
          errors = reason === 'source_error' ? errors + 1 : 0;
          if (
            reason === 'source_rate_limited' ||
            unauthorized >= ML_CAPTURE_LIMITS.unauthorizedInARow ||
            errors >= ML_CAPTURE_LIMITS.errorsInARow
          ) {
            closed = true;
          }
          continue;
        }
        unauthorized = 0;
        errors = 0;
        const body = details.get(c.externalItemId);
        const list = res.originalPrice ?? res.regularPrice ?? null;
        out.set(c.offerId, {
          ok: true,
          observedAt: new Date(ctx.clock()).toISOString(),
          price: round2(res.price),
          listPrice: list != null && list > res.price ? round2(list) : null,
          currency: isoCurrency(res.currency) ?? isoCurrency(body?.currency_id),
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
