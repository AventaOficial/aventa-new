import { comparableDimensionsFor, despensaNeedById } from '@/lib/despensa/catalog';
import { classifyDespensaText } from '@/lib/despensa/classify';
import { budgetFit, type BudgetFit, type DespensaBudget } from '@/lib/despensa/budget';
import {
  EVIDENCE_RANK,
  evidenceFreshness,
  evidenceLevel,
  savingEvidence,
  type DespensaPriceHistory,
  type EvidenceLevel,
  type Freshness,
  type SavingEvidence,
} from '@/lib/despensa/evidence';
import { parsePresentation, unitPriceFor, type UnitPrice } from '@/lib/despensa/presentation';

/**
 * Reglas del ranking de Despensa. Única fuente de umbrales; sube la versión al cambiarlas.
 *
 * Antes de ordenar, las ofertas incompletas o con evidencia vieja dejan de competir
 * (calidad y validez). El resto se ordena de forma lexicográfica, no por suma ponderada;
 * cada clave solo desempata la anterior:
 * 1. necesidad del catálogo (las ofertas de despensa van primero),
 * 2. nivel de evidencia del precio (validez y fuente identificable),
 * 3. precio unitario frente a ofertas comparables del mismo listado (misma necesidad,
 *    misma variante, misma unidad): igual o por debajo de la mediana, sin pares, o sin dato,
 * 4. respaldo del ahorro (`savingEvidence`): verificado por el historial propio de Aventa,
 *    luego sin referencia o con precio de lista sin confirmar (empatan: la etiqueta no suma),
 *    y al final el precio de lista que el historial contradice o el precio publicado que la
 *    última lectura de la tienda no confirma (`price_differs`). El tamaño del descuento
 *    nominal no entra en ninguna clave. Sin `priceHistory` (el feed) esta clave empata siempre,
 * 5. ajuste al presupuesto declarado (solo desempata; nunca oculta una oferta),
 * 6. frescura de la evidencia,
 * 7. relevancia personal (necesidades de `/me/intereses`, si se pasan),
 * 8. votos de la comunidad,
 * 9. fecha y luego id, para que el resultado sea determinista.
 * Después se reparte: tope de ofertas seguidas por necesidad y por tienda. No se borra nada.
 */
export const DESPENSA_RANK_RULES = {
  version: 'despensa-rank-v4',
  /** Evidencia más vieja que esto deja de competir. Coincide con la ventana semanal del feed. */
  maxEvidenceAgeDays: 7,
  /** Máximo de ofertas seguidas de la misma necesidad antes de ceder el lugar. */
  maxPerNeed: 3,
  /** Máximo de ofertas seguidas de la misma tienda antes de ceder el lugar. */
  maxConsecutivePerStore: 3,
} as const;

const FRESHNESS_RANK: Record<Freshness, number> = { fresh: 0, recent: 1, unknown: 2, stale: 3 };
const BUDGET_FIT_RANK: Record<BudgetFit, number> = { fits: 0, no_budget: 0, unknown_price: 1, over_share: 1 };
const SAVING_RANK: Record<SavingEvidence['status'], number> = {
  verified: 0,
  none: 1,
  list_unconfirmed: 1,
  list_contradicted: 2,
  price_differs: 2,
};

export type DespensaRankable = {
  id?: string | null;
  title?: string | null;
  discountPrice?: number | null;
  /** Precio de lista declarado. Solo cuenta si el historial lo contradice (baja), nunca para subir. */
  originalPrice?: number | null;
  /** Historial propio de 90 días (`computePriceInsight`). Ausente en el feed. */
  priceHistory?: DespensaPriceHistory | null;
  votes?: { score: number } | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  sourceHost?: string | null;
};

export type DespensaSignals = {
  needId: string | null;
  variantId: string | null;
  evidence: EvidenceLevel;
  unitPrice: UnitPrice | null;
  freshness: Freshness;
  personal: boolean;
  budgetFit: BudgetFit;
  saving: SavingEvidence;
  verifiedSaving: boolean;
};

export type DespensaDemotion = { id: string | null; reason: 'incomplete' | 'stale_evidence' };

export type DespensaRankOptions = {
  now: Date;
  preferredNeedIds?: ReadonlySet<string>;
  budget?: DespensaBudget | null;
};

export function despensaSignals<T extends DespensaRankable>(offer: T, opts: DespensaRankOptions): DespensaSignals {
  const hit = classifyDespensaText(offer.title);
  const need = despensaNeedById(hit?.needId);
  const unitPrice = need
    ? unitPriceFor(offer.discountPrice, parsePresentation(offer.title), comparableDimensionsFor(hit?.needId, hit?.variantId))
    : null;
  const saving = savingEvidence({
    price: offer.discountPrice,
    originalPrice: offer.originalPrice,
    history: offer.priceHistory,
  });
  return {
    needId: hit?.needId ?? null,
    variantId: hit?.variantId ?? null,
    evidence: evidenceLevel(
      { title: offer.title, price: offer.discountPrice, sourceHost: offer.sourceHost, expiresAt: offer.expiresAt },
      opts.now,
    ),
    unitPrice,
    freshness: evidenceFreshness(offer.createdAt, opts.now, DESPENSA_RANK_RULES.maxEvidenceAgeDays),
    personal: Boolean(hit && opts.preferredNeedIds?.has(hit.needId)),
    budgetFit: budgetFit(offer.discountPrice, opts.budget),
    saving,
    verifiedSaving: saving.status === 'verified',
  };
}

/**
 * Grupo de comparación de precio unitario. Null si la oferta no puede compararse:
 * sin precio unitario, o necesidad con variantes y variante no identificada.
 */
export function unitPriceGroupKey(s: Pick<DespensaSignals, 'needId' | 'variantId' | 'unitPrice'>): string | null {
  if (!s.needId || !s.unitPrice) return null;
  const hasVariants = Boolean(despensaNeedById(s.needId)?.variants?.length);
  if (hasVariants && !s.variantId) return null;
  return `${s.needId}|${s.variantId ?? '-'}|${s.unitPrice.dimension}|${s.unitPrice.per}`;
}

export type UnitPriceStanding = 'at_or_below_median' | 'above_median' | 'no_peer' | 'not_comparable';
const UNIT_PRICE_RANK: Record<UnitPriceStanding, number> = {
  at_or_below_median: 0,
  above_median: 1,
  no_peer: 1,
  not_comparable: 2,
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Posición de cada precio unitario frente a sus comparables del mismo listado. */
export function unitPriceStandings(signals: readonly DespensaSignals[]): UnitPriceStanding[] {
  const groups = new Map<string, number[]>();
  const keys = signals.map((s) => unitPriceGroupKey(s));
  keys.forEach((key, i) => {
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push(signals[i].unitPrice!.value);
    groups.set(key, list);
  });
  const medians = new Map([...groups].map(([k, values]) => [k, median(values)]));
  return keys.map((key, i) => {
    if (!signals[i].unitPrice) return 'not_comparable';
    if (!key || (groups.get(key)?.length ?? 0) < 2) return 'no_peer';
    return signals[i].unitPrice!.value <= medians.get(key)! ? 'at_or_below_median' : 'above_median';
  });
}

function compareKeys(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function sortKey<T extends DespensaRankable>(offer: T, s: DespensaSignals, standing: UnitPriceStanding): (number | string)[] {
  const created = offer.createdAt ? Date.parse(offer.createdAt) : NaN;
  return [
    s.needId ? 0 : 1,
    EVIDENCE_RANK[s.evidence],
    UNIT_PRICE_RANK[standing],
    SAVING_RANK[s.saving.status],
    BUDGET_FIT_RANK[s.budgetFit],
    FRESHNESS_RANK[s.freshness],
    s.personal ? 0 : 1,
    -(offer.votes?.score ?? 0),
    Number.isFinite(created) ? -created : 0,
    offer.id ?? '',
  ];
}

/** Cede el lugar cuando una necesidad satura el inicio. No borra ofertas. */
function spreadNeeds<T>(items: readonly { offer: T; needId: string | null }[], maxPerNeed: number): T[] {
  const counts = new Map<string, number>();
  const kept: T[] = [];
  const deferred: T[] = [];
  for (const { offer, needId } of items) {
    if (!needId) {
      kept.push(offer);
      continue;
    }
    const seen = counts.get(needId) ?? 0;
    if (seen >= maxPerNeed) {
      deferred.push(offer);
      continue;
    }
    counts.set(needId, seen + 1);
    kept.push(offer);
  }
  return [...kept, ...deferred];
}

/**
 * Evita rachas largas de una misma tienda. La primera oferta disponible de otra tienda
 * entra antes; si no queda ninguna, el resto conserva su orden. No borra ofertas.
 */
export function spreadStores<T extends { sourceHost?: string | null }>(list: readonly T[], maxRun: number): T[] {
  const pending = [...list];
  const out: T[] = [];
  let lastHost: string | null = null;
  let run = 0;
  while (pending.length > 0) {
    let idx = 0;
    if (lastHost && run >= maxRun) {
      const other = pending.findIndex((o) => (o.sourceHost ?? null) !== lastHost);
      if (other >= 0) idx = other;
    }
    const [next] = pending.splice(idx, 1);
    const host = next.sourceHost ?? null;
    run = host && host === lastHost ? run + 1 : 1;
    lastHost = host;
    out.push(next);
  }
  return out;
}

/**
 * Ordena con las reglas de Despensa. Las ofertas incompletas o con evidencia vieja
 * no compiten: quedan en `demoted`, en su orden de entrada, para que quien llama decida
 * si las muestra al final o no las muestra.
 */
export function rankDespensa<T extends DespensaRankable>(
  offers: readonly T[],
  opts: DespensaRankOptions,
): {
  ranked: T[];
  /** Mismo conjunto que `ranked` en orden de mérito, antes de repartir necesidades y tiendas. */
  byMerit: T[];
  demoted: T[];
  demotions: DespensaDemotion[];
  rulesVersion: string;
} {
  const demoted: T[] = [];
  const demotions: DespensaDemotion[] = [];
  const competing: { offer: T; signals: DespensaSignals }[] = [];
  for (const offer of offers) {
    const signals = despensaSignals(offer, opts);
    const reason =
      signals.evidence === 'incomplete' ? 'incomplete' : signals.freshness === 'stale' ? 'stale_evidence' : null;
    if (reason) {
      demoted.push(offer);
      demotions.push({ id: offer.id ?? null, reason });
      continue;
    }
    competing.push({ offer, signals });
  }
  const standings = unitPriceStandings(competing.map((c) => c.signals));
  const scored = competing.map((c, i) => ({ ...c, key: sortKey(c.offer, c.signals, standings[i]) }));
  scored.sort((a, b) => compareKeys(a.key, b.key));
  const byNeed = spreadNeeds(
    scored.map((s) => ({ offer: s.offer, needId: s.signals.needId })),
    DESPENSA_RANK_RULES.maxPerNeed,
  );
  const ranked = spreadStores(byNeed, DESPENSA_RANK_RULES.maxConsecutivePerStore);
  return { ranked, byMerit: scored.map((s) => s.offer), demoted, demotions, rulesVersion: DESPENSA_RANK_RULES.version };
}
