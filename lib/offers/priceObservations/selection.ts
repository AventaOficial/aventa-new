import type { SupabaseClient } from '@supabase/supabase-js';
import { anchorKey, type ProductAnchor } from './identity';
import { PRICE_OBSERVATION_POLICY as P, type ActiveCaptureSourceId } from './policy';

/**
 * Selección escalable de productos para la captura.
 *
 * 1. Universo: ofertas aprobadas/publicadas, sin borrar, vigentes o caducadas hace ≤ 45 días y de
 *    una fuente capturable (filtro en SQL). Se recorre por `id` con paginación por cursor, con un
 *    presupuesto de ofertas por corrida. Si el universo cabe en el presupuesto, se recorre
 *    completo; si no, el punto de partida rota cada día (secuencia de baja discrepancia) y el
 *    reporte marca `scanComplete: false`.
 * 2. Prioridad: por producto, horas desde la última observación (saturadas en la duración del
 *    ciclo; nunca observado = saturado), más un bono si aún no reúne el historial mínimo, menos un
 *    poco si su oferta ya caducó; empates por sorteo diario. Un producto capturado vuelve al final
 *    de la cola: ninguno se queda fuera indefinidamente por tener ofertas más viejas. Los
 *    atrasados (fuera del ciclo) tienen una reserva del 25 % del cupo; ver `staleCapHours`.
 * 3. Determinista por día: dos corridas concurrentes eligen lo mismo y el índice único evita
 *    duplicados. No guarda estado propio.
 */

export const SCAN_PAGE_SIZE = 500;
const DAY_MS = 86_400_000;
/**
 * Ciclo esperado: elegibles ÷ capacidad por corrida, + 1 día (mínimo 2 días, máximo la ventana).
 * Dentro del ciclo la rotación es estricta (el más atrasado primero). Un producto que excede el
 * ciclo —observado hace más que eso, o nunca observado aunque su primera oferta ya es más vieja—
 * está «atrasado»: casi siempre porque la fuente falla con él (p. ej. retirado). Los atrasados
 * comparten una reserva del cupo por sorteo diario y solo toman el resto si sobra, para que un
 * producto que falla siempre no acapare todas las corridas. No se guarda estado: el atraso se
 * deduce de las observaciones y de la fecha de las ofertas.
 */
const MIN_CYCLE_HOURS = 24 * 2;
const MAX_CYCLE_HOURS = 24 * P.windowDays;
export const OVERDUE_RESERVED_SHARE = 0.25;

export function staleCapHours(eligibleProducts: number, runCapacity: number): number {
  const cycleDays = runCapacity > 0 ? Math.ceil(eligibleProducts / runCapacity) + 1 : P.windowDays;
  return Math.min(MAX_CYCLE_HOURS, Math.max(MIN_CYCLE_HOURS, cycleDays * 24));
}
const NEEDS_HISTORY_BONUS_HOURS = 24;
const EXPIRED_ANCHOR_PENALTY_HOURS = 12;
const STATS_CHUNK = 200;
export const PRODUCT_STATS_RPC = 'price_capture_product_stats';

/** Filtro PostgREST (`or`) por fuente: solo ofertas que esa fuente puede llegar a resolver. */
const POOL_FILTER: Record<ActiveCaptureSourceId, string> = {
  mercadolibre_mx: 'offer_url.ilike.*mercadolibre.com.mx*,offer_url.ilike.*meli.la*,product_fingerprint.like.ml:*',
};

export type PoolOfferRow = {
  id: string;
  title: string | null;
  price: number | string | null;
  original_price: number | string | null;
  offer_url: string | null;
  product_fingerprint: string | null;
  source_currency: string | null;
  expires_at: string | null;
  created_at: string | null;
};

const POOL_SELECT = 'id, title, price, original_price, offer_url, product_fingerprint, source_currency, expires_at, created_at';

/** Inicio rotatorio del recorrido: uuid en la fracción `frac(día × φ)` del espacio de ids. */
export function scanStartKey(nowMs: number): string {
  const day = Math.floor(nowMs / DAY_MS);
  const fraction = (day * 0.6180339887498949) % 1;
  const hex = Math.floor(fraction * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${hex}-0000-0000-0000-000000000000`;
}

export type PoolScan = {
  rows: PoolOfferRow[];
  pages: number;
  /** Se recorrió todo el universo elegible en esta corrida. */
  complete: boolean;
  /** Fracción (0–1] del espacio de ids recorrida; 1 si `complete`. Sirve para estimar el universo. */
  coveredFraction: number;
  startKey: string;
  failed: boolean;
};

/** Posición (0–1) de un uuid en el espacio de ids, por sus primeros 32 bits. */
function keyPosition(id: string): number {
  const n = Number.parseInt(id.slice(0, 8), 16);
  return Number.isFinite(n) ? n / 0x100000000 : 0;
}

export async function scanCandidatePool(
  supabase: SupabaseClient,
  opts: { sources: readonly ActiveCaptureSourceId[]; nowMs: number; budget: number; pageSize?: number },
): Promise<PoolScan> {
  const pageSize = opts.pageSize ?? SCAN_PAGE_SIZE;
  const floor = new Date(opts.nowMs - P.trackingDaysAfterExpiry * DAY_MS).toISOString();
  const startKey = scanStartKey(opts.nowMs);
  const out: PoolScan = { rows: [], pages: 0, complete: false, coveredFraction: 1, startKey, failed: false };
  const sourceFilter = opts.sources.map((s) => POOL_FILTER[s]).join(',');
  if (!sourceFilter) {
    out.complete = true;
    return out;
  }
  const start = keyPosition(startKey);

  // Tramo 1: ids > inicio. Tramo 2 (vuelta): ids ≤ inicio.
  for (const segment of ['after', 'wrap'] as const) {
    let cursor: string | null = null;
    for (;;) {
      const room = opts.budget - out.rows.length;
      if (room <= 0) {
        const last = keyPosition(out.rows[out.rows.length - 1]?.id ?? startKey);
        const covered = segment === 'after' ? last - start : 1 - start + last;
        out.coveredFraction = Math.min(1, Math.max(covered, 1e-6));
        return out;
      }
      let q = supabase
        .from('offers')
        .select(POOL_SELECT)
        .in('status', ['approved', 'published'])
        .is('deleted_at', null)
        .or(`expires_at.is.null,expires_at.gte."${floor}"`)
        .or(sourceFilter);
      if (segment === 'after') q = q.gt('id', cursor ?? startKey);
      else {
        q = q.lte('id', startKey);
        if (cursor) q = q.gt('id', cursor);
      }
      const { data, error } = await q.order('id', { ascending: true }).limit(Math.min(pageSize, room));
      out.pages += 1;
      if (error) {
        out.failed = true;
        return out;
      }
      const rows = (data ?? []) as PoolOfferRow[];
      out.rows.push(...rows);
      if (rows.length < Math.min(pageSize, room)) break;
      cursor = rows[rows.length - 1].id;
    }
  }
  out.complete = true;
  return out;
}

export type ProductStats = {
  lastObservedAt: string | null;
  validDays: number;
  firstValidAt: string | null;
  lastValidAt: string | null;
};

export type StatsLoad = {
  byAnchor: Map<string, ProductStats>;
  /** `rpc`: función de la migración 20261013; `fallback`: solo se sabe qué se capturó hace poco. */
  source: 'rpc' | 'fallback';
  failed: boolean;
};

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|function .* does not exist/i.test(error.message ?? '');
}

/**
 * Última observación y días válidos por producto (90 días), en lotes de 200 items. Si la
 * función no existe (migración sin aplicar), cae a la consulta de capturas recientes. Cualquier
 * otra falla se reporta: la captura no elige a ciegas.
 */
export async function loadProductStats(
  supabase: SupabaseClient,
  anchors: readonly ProductAnchor[],
  opts: { nowMs: number; recentSinceMs: number },
): Promise<StatsLoad> {
  const out: StatsLoad = { byAnchor: new Map(), source: 'rpc', failed: false };
  const since = new Date(opts.nowMs - P.windowDays * DAY_MS).toISOString();
  const bySource = new Map<string, string[]>();
  for (const a of anchors) bySource.set(a.sourceId, [...(bySource.get(a.sourceId) ?? []), a.externalItemId]);

  for (const [sourceId, items] of bySource) {
    for (let i = 0; i < items.length; i += STATS_CHUNK) {
      const chunk = [...new Set(items.slice(i, i + STATS_CHUNK))];
      if (out.source === 'rpc') {
        const { data, error } = await supabase.rpc(PRODUCT_STATS_RPC, { p_source_id: sourceId, p_item_ids: chunk, p_since: since });
        if (!error && Array.isArray(data)) {
          for (const r of data as { external_item_id: string; last_recorded_at: string | null; valid_days: number | null; first_valid_at: string | null; last_valid_at: string | null }[]) {
            out.byAnchor.set(`${sourceId}:${r.external_item_id}`, {
              lastObservedAt: r.last_recorded_at,
              validDays: Number(r.valid_days ?? 0),
              firstValidAt: r.first_valid_at,
              lastValidAt: r.last_valid_at,
            });
          }
          continue;
        }
        if (error && !isMissingFunction(error)) {
          out.failed = true;
          return out;
        }
        out.source = 'fallback';
      }
      const { data, error } = await supabase
        .from('offer_price_snapshots')
        .select('source_id, external_item_id, recorded_at')
        .eq('source', 'capture')
        .eq('source_id', sourceId)
        .in('external_item_id', chunk)
        .gte('recorded_at', new Date(opts.recentSinceMs).toISOString());
      if (error) {
        out.failed = true;
        return out;
      }
      for (const r of (data ?? []) as { source_id: string; external_item_id: string; recorded_at: string }[]) {
        const key = `${r.source_id}:${r.external_item_id}`;
        const prev = out.byAnchor.get(key);
        if (!prev || (prev.lastObservedAt ?? '') < r.recorded_at) {
          out.byAnchor.set(key, { lastObservedAt: r.recorded_at, validDays: 0, firstValidAt: null, lastValidAt: null });
        }
      }
    }
  }
  return out;
}

export function needsHistory(s: ProductStats | undefined): boolean {
  if (!s || s.validDays < P.minIndependentObservations + 1 || !s.firstValidAt || !s.lastValidAt) return true;
  return (Date.parse(s.lastValidAt) - Date.parse(s.firstValidAt)) / DAY_MS < P.minHistorySpanDays;
}

export function staleHours(s: ProductStats | undefined, nowMs: number): number | null {
  if (!s?.lastObservedAt) return null;
  return Math.max(0, (nowMs - Date.parse(s.lastObservedAt)) / 3_600_000);
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Prioritized<T> = { ordered: T[]; overdue: Set<string> };

/**
 * Orden de captura: primero la reserva de atrasados (por sorteo), luego los demás por puntaje
 * (antigüedad + bono de historial − caducada), y al final el resto de atrasados. Los topes de la
 * corrida se aplican sobre este orden. Empates por un hash del producto que cambia cada día.
 */
export function prioritize<T extends ProductAnchor & { anchorExpired: boolean }>(
  candidates: readonly T[],
  stats: Map<string, ProductStats>,
  nowMs: number,
  opts: { cycleHours: number; runCapacity: number; firstSeenMs: (c: T) => number | null },
): Prioritized<T> {
  const day = Math.floor(nowMs / DAY_MS);
  const cap = opts.cycleHours;
  const overdue = new Set<string>();
  const scored = candidates.map((c) => {
    const key = anchorKey(c);
    const s = stats.get(key);
    const stale = staleHours(s, nowMs);
    const firstSeen = opts.firstSeenMs(c);
    const late = stale != null ? stale > cap : firstSeen != null && (nowMs - firstSeen) / 3_600_000 > cap;
    if (late) overdue.add(key);
    const age = Math.min(stale ?? cap, cap);
    const score = age + (needsHistory(s) ? NEEDS_HISTORY_BONUS_HOURS : 0) - (c.anchorExpired ? EXPIRED_ANCHOR_PENALTY_HOURS : 0);
    return { c, late, score, tie: hash32(`${day}|${key}`) };
  });
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.tie - b.tie;
  const late = scored.filter((x) => x.late).sort((a, b) => a.tie - b.tie);
  const onTime = scored.filter((x) => !x.late).sort(byScore);
  const reserved = Math.ceil(opts.runCapacity * OVERDUE_RESERVED_SHARE);
  const ordered = [...late.slice(0, reserved), ...onTime, ...late.slice(reserved)].map((x) => x.c);
  return { ordered, overdue };
}

export type CaptureCoverage = {
  scannedOffers: number;
  scanPages: number;
  /** false: el universo no cupo en el presupuesto de esta corrida; la cobertura es parcial. */
  scanComplete: boolean;
  scanStartKey: string;
  statsSource: 'rpc' | 'fallback' | 'unavailable';
  eligibleProducts: number;
  /** Universo estimado si el recorrido quedó incompleto (elegibles ÷ fracción recorrida). */
  estimatedEligibleProducts: number;
  /**
   * Productos elegibles con observación (de cualquier estado) en las últimas 48 h, incluida esta
   * corrida. Con `statsSource: 'fallback'` es una cota inferior (solo se conocen las capturas
   * posteriores a `minHoursBetweenCaptures`).
   */
  observedWithin48h: number;
  /** observedWithin48h / eligibleProducts (0–1). Métrica verificable con la consulta del documento. */
  coverage48h: number | null;
  /** null si no se pudo saber (sin la función de estadísticas). */
  neverObserved: number | null;
  needingHistory: number | null;
  /** Mayor antigüedad (h) de la última observación entre productos elegibles ya observados. */
  oldestObservationHours: number | null;
  /** Elegibles que no entraron por topes de la corrida (se priorizan en la siguiente). */
  deferredByQuota: number;
  /** Duración esperada del ciclo de rotación (h): elegibles ÷ capacidad + 1 día. */
  cycleHours: number | null;
  /** Elegibles fuera del ciclo (casi siempre, fallas repetidas de la fuente con ese producto). */
  overdueProducts: number | null;
  /** Productos que la configuración permite capturar por corrida. */
  runCapacity: number;
};
