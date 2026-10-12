import { DESPENSA_CATALOG_VERSION, comparableDimensionsFor, despensaNeedById } from '@/lib/despensa/catalog';
import { classifyDespensaText } from '@/lib/despensa/classify';
import { parsePresentation, unitPriceFor, type Presentation, type UnitPrice } from '@/lib/despensa/presentation';
import { despensaHostOf, despensaSourceForUrl } from '@/lib/despensa/sources';
import { normalizeInterestText } from '@/lib/interests/normalize';

/**
 * Cuatro objetos distintos que no deben mezclarse:
 * A. Producto de catálogo: `DespensaNeed` + variante (`catalog.ts`). Describe una necesidad.
 * B. Observación de precio: este módulo. Un precio visto en una fuente, tienda, presentación,
 *    lugar y momento. Una observación no es un promedio, ni un precio habitual, ni historial.
 * C. Candidato de oferta: lo que un bot o usuario propone por MCP (`submit_deal_candidates`)
 *    o por el formulario. Queda `pending` y pasa por las validaciones existentes.
 * D. Oferta publicada: fila de `offers` aprobada por moderación humana.
 *
 * Este módulo es puro: no escribe en ninguna tabla ni hace fetch de URLs.
 */

export const OBSERVATION_RULES = {
  version: 'despensa-observation-v1',
  /** Dos observaciones de la misma presentación en la misma tienda y región dentro de esta ventana son una sola. */
  dedupeWindowHours: 24,
  /** Historial longitudinal: al menos estas observaciones independientes… */
  minIndependentObservations: 4,
  /** …repartidas en al menos estos días. */
  minHistorySpanDays: 14,
  /** Bajada mínima frente a la mediana propia para hablar de ahorro verificado. */
  minVerifiedDropPct: 5,
  /** Coincidencia mínima entre el título enviado y el título observado en la página. */
  minTitleOverlap: 0.5,
} as const;

export type ObservationRegion =
  | { scope: 'online_national'; label: null }
  | { scope: 'online_unknown'; label: null }
  | { scope: 'physical_store'; label: string }
  | { scope: 'region'; label: string };

export type ObservationAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';

export type ObservationAgent = { kind: 'grok_bot' | 'worker' | 'community'; id: string };

/** Lo que entrega un agente. Todo es declarado hasta que Aventa lo valida. */
export type RawObservationInput = {
  url: string;
  title: string;
  /** Título tal como aparece en la página observada; sirve para comprobar que el enlace es el producto. */
  pageTitle: string;
  price: number;
  currency: string;
  observedAt: string;
  brand?: string | null;
  needId?: string | null;
  region?: ObservationRegion | null;
  availability?: ObservationAvailability | null;
  /** Precio de lista solo si la tienda lo muestra en la misma página y momento. */
  listPrice?: number | null;
  screenshotRef?: string | null;
  agent: ObservationAgent;
};

export type DespensaPriceObservation = {
  catalogVersion: string;
  needId: string | null;
  variantId: string | null;
  brand: string | null;
  title: string;
  presentation: Presentation | null;
  storeHost: string;
  sourceId: string | null;
  canonicalUrl: string;
  price: number;
  currency: 'MXN';
  unitPrice: UnitPrice | null;
  observedAt: string;
  region: ObservationRegion;
  availability: ObservationAvailability;
  evidence: { url: string; pageTitle: string; listPrice: number | null; screenshotRef: string | null };
  agent: ObservationAgent;
  confidence: 'high' | 'medium' | 'low';
  verification: 'unverified' | 'link_title_matches';
};

export type ObservationRejection =
  | 'invalid_url'
  | 'missing_title'
  | 'invalid_price'
  | 'invalid_currency'
  | 'invalid_observed_at'
  | 'link_title_mismatch'
  | 'need_mismatch'
  | 'invalid_list_price'
  | 'missing_agent';

function tokens(text: string): Set<string> {
  return new Set(normalizeInterestText(text).split(' ').filter((t) => t.length > 1));
}

/** Proporción de palabras del título enviado que aparecen en el título observado. */
export function titleOverlap(submitted: string, observed: string): number {
  const a = tokens(submitted);
  const b = tokens(observed);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / a.size;
}

function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function confidenceOf(o: Pick<DespensaPriceObservation, 'sourceId' | 'unitPrice' | 'needId' | 'variantId' | 'availability'>): DespensaPriceObservation['confidence'] {
  const needsVariant = Boolean(despensaNeedById(o.needId)?.variants?.length);
  const identified = Boolean(o.needId) && (!needsVariant || Boolean(o.variantId));
  if (o.sourceId && o.unitPrice && identified && o.availability !== 'unknown') return 'high';
  if (o.sourceId && (o.unitPrice || identified)) return 'medium';
  return 'low';
}

/**
 * Normaliza una observación declarada. Rechaza en vez de adivinar: sin título de página
 * que coincida no hay forma de saber que la URL es el producto.
 */
export function normalizeObservation(
  raw: RawObservationInput,
  now: Date,
): { ok: true; observation: DespensaPriceObservation } | { ok: false; reasons: ObservationRejection[] } {
  const reasons: ObservationRejection[] = [];
  const url = typeof raw.url === 'string' ? canonicalUrl(raw.url) : null;
  if (!url) reasons.push('invalid_url');
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) reasons.push('missing_title');
  if (!(typeof raw.price === 'number' && Number.isFinite(raw.price) && raw.price > 0)) reasons.push('invalid_price');
  if (raw.currency !== 'MXN') reasons.push('invalid_currency');
  const observedMs = typeof raw.observedAt === 'string' ? Date.parse(raw.observedAt) : NaN;
  if (!Number.isFinite(observedMs) || observedMs > now.getTime() + 10 * 60_000) reasons.push('invalid_observed_at');
  if (!raw.agent?.id?.trim()) reasons.push('missing_agent');
  if (title && (typeof raw.pageTitle !== 'string' || titleOverlap(title, raw.pageTitle) < OBSERVATION_RULES.minTitleOverlap)) {
    reasons.push('link_title_mismatch');
  }
  if (raw.listPrice != null && !(typeof raw.listPrice === 'number' && raw.listPrice > raw.price)) reasons.push('invalid_list_price');

  const hit = classifyDespensaText(title);
  if (raw.needId && raw.needId !== hit?.needId) reasons.push('need_mismatch');
  if (reasons.length > 0 || !url) return { ok: false, reasons };

  const presentation = parsePresentation(title);
  const unitPrice = hit ? unitPriceFor(raw.price, presentation, comparableDimensionsFor(hit.needId, hit.variantId)) : null;
  const source = despensaSourceForUrl(url);
  const partial = {
    needId: hit?.needId ?? null,
    variantId: hit?.variantId ?? null,
    sourceId: source?.id ?? null,
    unitPrice,
    availability: raw.availability ?? 'unknown',
  };
  return {
    ok: true,
    observation: {
      catalogVersion: DESPENSA_CATALOG_VERSION,
      ...partial,
      brand: raw.brand?.trim() || null,
      title,
      presentation,
      storeHost: despensaHostOf(url) ?? '',
      canonicalUrl: url,
      price: Math.round(raw.price * 100) / 100,
      currency: 'MXN',
      observedAt: new Date(observedMs).toISOString(),
      region: raw.region ?? { scope: 'online_unknown', label: null },
      evidence: {
        url,
        pageTitle: raw.pageTitle.trim(),
        listPrice: raw.listPrice ?? null,
        screenshotRef: raw.screenshotRef ?? null,
      },
      agent: { kind: raw.agent.kind, id: raw.agent.id.trim() },
      confidence: confidenceOf(partial),
      verification: 'link_title_matches',
    },
  };
}

/** Identidad de la presentación observada: producto, variante, marca, contenido, tienda y región. */
export function observationSkuKey(o: DespensaPriceObservation): string {
  const p = o.presentation;
  const content = p ? `${p.dimension}:${p.totalBase}:${p.countUnit ?? '-'}` : `title:${normalizeInterestText(o.title)}`;
  const brand = o.brand ? normalizeInterestText(o.brand) : '-';
  const region = `${o.region.scope}:${o.region.label ? normalizeInterestText(o.region.label) : '-'}`;
  return [o.needId ?? '-', o.variantId ?? '-', brand, content, o.storeHost, region].join('|');
}

export function observationDedupeKey(o: DespensaPriceObservation): string {
  const bucket = Math.floor(Date.parse(o.observedAt) / (OBSERVATION_RULES.dedupeWindowHours * 3_600_000));
  return `${observationSkuKey(o)}|w${bucket}`;
}

export type ObservationGroup = {
  key: string;
  skuKey: string;
  /** La primera observación del grupo; las demás solo aportan procedencia. */
  observation: DespensaPriceObservation;
  provenance: { agentId: string; url: string; observedAt: string; price: number }[];
};

/** Agrupa duplicados sin perder procedencia. Un mismo precio repetido cuenta una vez. */
export function dedupeObservations(list: readonly DespensaPriceObservation[]): { groups: ObservationGroup[]; duplicates: number } {
  const byKey = new Map<string, ObservationGroup>();
  let duplicates = 0;
  for (const o of list) {
    const key = observationDedupeKey(o);
    const entry = { agentId: o.agent.id, url: o.canonicalUrl, observedAt: o.observedAt, price: o.price };
    const existing = byKey.get(key);
    if (existing) {
      duplicates += 1;
      existing.provenance.push(entry);
      continue;
    }
    byKey.set(key, { key, skuKey: observationSkuKey(o), observation: o, provenance: [entry] });
  }
  return { groups: [...byKey.values()], duplicates };
}

export type HistoryStatus = 'none' | 'single_observation' | 'insufficient' | 'longitudinal';

/**
 * Estado del historial de una presentación. Solo cuenta observaciones independientes:
 * una por ventana de deduplicación. Varias presentaciones o tiendas nunca suman historial.
 */
export function historyStatus(observations: readonly DespensaPriceObservation[]): {
  status: HistoryStatus;
  independent: number;
  spanDays: number;
} {
  const { groups } = dedupeObservations(observations);
  const skus = new Set(groups.map((g) => g.skuKey));
  if (groups.length === 0) return { status: 'none', independent: 0, spanDays: 0 };
  if (skus.size > 1) throw new Error('historyStatus recibe una sola presentación (mismo observationSkuKey)');
  const times = groups.map((g) => Date.parse(g.observation.observedAt)).sort((a, b) => a - b);
  const spanDays = (times[times.length - 1] - times[0]) / 86_400_000;
  if (groups.length === 1) return { status: 'single_observation', independent: 1, spanDays: 0 };
  const longitudinal =
    groups.length >= OBSERVATION_RULES.minIndependentObservations && spanDays >= OBSERVATION_RULES.minHistorySpanDays;
  return { status: longitudinal ? 'longitudinal' : 'insufficient', independent: groups.length, spanDays: Math.round(spanDays * 10) / 10 };
}

export type SavingAssessment = {
  observedPrice: number;
  unitPrice: UnitPrice | null;
  history: HistoryStatus;
  /** Referencia válida, si existe. El precio de lista de la tienda no es una referencia verificada. */
  reference: { kind: 'own_history_median'; price: number; observations: number } | null;
  difference: number | null;
  verifiedDropPct: number | null;
  /** Lo que se puede afirmar públicamente. */
  claim: 'verified_drop' | 'no_drop' | 'price_only';
};

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Ahorro verificable de una observación frente a su propio historial (misma presentación,
 * tienda y región). Sin historial longitudinal la única afirmación posible es el precio.
 */
export function assessSaving(current: DespensaPriceObservation, prior: readonly DespensaPriceObservation[]): SavingAssessment {
  const sku = observationSkuKey(current);
  const currentWindow = observationDedupeKey(current);
  const sameSku = prior.filter((p) => observationSkuKey(p) === sku && observationDedupeKey(p) !== currentWindow && Date.parse(p.observedAt) < Date.parse(current.observedAt));
  const history = historyStatus(sameSku);
  const base = { observedPrice: current.price, unitPrice: current.unitPrice, history: history.status };
  if (history.status !== 'longitudinal') {
    return { ...base, reference: null, difference: null, verifiedDropPct: null, claim: 'price_only' };
  }
  const reference = medianOf(dedupeObservations(sameSku).groups.map((g) => g.observation.price));
  const difference = Math.round((reference - current.price) * 100) / 100;
  const pct = Math.round((difference / reference) * 1000) / 10;
  const verified = pct >= OBSERVATION_RULES.minVerifiedDropPct;
  return {
    ...base,
    reference: { kind: 'own_history_median', price: reference, observations: history.independent },
    difference,
    verifiedDropPct: verified ? pct : null,
    claim: verified ? 'verified_drop' : 'no_drop',
  };
}
