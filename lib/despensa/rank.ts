import { despensaNeedById } from '@/lib/despensa/catalog';
import { classifyDespensaText } from '@/lib/despensa/classify';
import {
  EVIDENCE_RANK,
  evidenceFreshness,
  evidenceLevel,
  type EvidenceLevel,
  type Freshness,
} from '@/lib/despensa/evidence';
import { parsePresentation, unitPriceFor, type UnitPrice } from '@/lib/despensa/presentation';

/**
 * Reglas del ranking de Despensa. Única fuente de umbrales; sube la versión al cambiarlas.
 *
 * El orden es lexicográfico, no una suma ponderada. Cada clave solo desempata la anterior:
 * 1. necesidad del catálogo (las ofertas de despensa van primero),
 * 2. nivel de evidencia del precio,
 * 3. presentación comparable (precio unitario calculable),
 * 4. frescura de la evidencia,
 * 5. relevancia personal (necesidades de `/me/intereses`, si se pasan),
 * 6. votos de la comunidad,
 * 7. fecha y luego id, para que el resultado sea determinista.
 * Los votos van al final: no pueden subir una oferta por encima de otra con mejor evidencia.
 */
export const DESPENSA_RANK_RULES = {
  version: 'despensa-rank-v1',
  /** Evidencia más vieja que esto deja de competir. Coincide con la ventana semanal del feed. */
  maxEvidenceAgeDays: 7,
  /** Máximo de ofertas seguidas de la misma necesidad antes de ceder el lugar. */
  maxPerNeed: 3,
} as const;

const FRESHNESS_RANK: Record<Freshness, number> = { fresh: 0, recent: 1, unknown: 2, stale: 3 };

export type DespensaRankable = {
  id?: string | null;
  title?: string | null;
  discountPrice?: number | null;
  votes?: { score: number } | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  sourceHost?: string | null;
};

export type DespensaSignals = {
  needId: string | null;
  evidence: EvidenceLevel;
  unitPrice: UnitPrice | null;
  freshness: Freshness;
  personal: boolean;
};

export type DespensaDemotion = { id: string | null; reason: 'incomplete' | 'stale_evidence' };

export type DespensaRankOptions = {
  now: Date;
  preferredNeedIds?: ReadonlySet<string>;
};

export function despensaSignals<T extends DespensaRankable>(offer: T, opts: DespensaRankOptions): DespensaSignals {
  const hit = classifyDespensaText(offer.title);
  const need = despensaNeedById(hit?.needId);
  const unitPrice = need
    ? unitPriceFor(offer.discountPrice, parsePresentation(offer.title), need.comparableBy)
    : null;
  return {
    needId: hit?.needId ?? null,
    evidence: evidenceLevel(
      { title: offer.title, price: offer.discountPrice, sourceHost: offer.sourceHost, expiresAt: offer.expiresAt },
      opts.now,
    ),
    unitPrice,
    freshness: evidenceFreshness(offer.createdAt, opts.now, DESPENSA_RANK_RULES.maxEvidenceAgeDays),
    personal: Boolean(hit && opts.preferredNeedIds?.has(hit.needId)),
  };
}

function compareKeys(a: readonly (number | string)[], b: readonly (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function sortKey<T extends DespensaRankable>(offer: T, s: DespensaSignals): (number | string)[] {
  const created = offer.createdAt ? Date.parse(offer.createdAt) : NaN;
  return [
    s.needId ? 0 : 1,
    EVIDENCE_RANK[s.evidence],
    s.unitPrice ? 0 : 1,
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
 * Ordena con las reglas de Despensa. Las ofertas incompletas o con evidencia vieja
 * no compiten: quedan en `demoted`, en su orden de entrada, para que quien llama decida
 * si las muestra al final o no las muestra.
 */
export function rankDespensa<T extends DespensaRankable>(
  offers: readonly T[],
  opts: DespensaRankOptions,
): { ranked: T[]; demoted: T[]; demotions: DespensaDemotion[]; rulesVersion: string } {
  const demoted: T[] = [];
  const demotions: DespensaDemotion[] = [];
  const scored: { offer: T; signals: DespensaSignals; key: (number | string)[] }[] = [];
  for (const offer of offers) {
    const signals = despensaSignals(offer, opts);
    const reason =
      signals.evidence === 'incomplete' ? 'incomplete' : signals.freshness === 'stale' ? 'stale_evidence' : null;
    if (reason) {
      demoted.push(offer);
      demotions.push({ id: offer.id ?? null, reason });
      continue;
    }
    scored.push({ offer, signals, key: sortKey(offer, signals) });
  }
  scored.sort((a, b) => compareKeys(a.key, b.key));
  const ranked = spreadNeeds(
    scored.map((s) => ({ offer: s.offer, needId: s.signals.needId })),
    DESPENSA_RANK_RULES.maxPerNeed,
  );
  return { ranked, demoted, demotions, rulesVersion: DESPENSA_RANK_RULES.version };
}
