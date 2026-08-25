import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { ScoreBreakdown, ScoreDecision } from './scoreIngestCandidate';

export const BOT_META_VERSION = 1;

type BuildInput = {
  meta: ParsedOfferMetadata;
  scoreBreakdown?: ScoreBreakdown;
  ingestSource?: string;
  ingestSourceDetail?: string;
  decision?: ScoreDecision;
};

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value == null) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Empaqueta las señales que el bot ya calcula (vendidos, rating, intel de precio,
 * desglose del score) para que moderación pueda decidir sin foto.
 * Devuelve `null` cuando no hay nada que guardar.
 */
export function buildBotMeta({
  meta,
  scoreBreakdown,
  ingestSource,
  ingestSourceDetail,
  decision,
}: BuildInput): Record<string, unknown> | null {
  const s = meta.signals;

  const signals = s
    ? compact({
        ratingAverage: s.ratingAverage,
        ratingCount: s.ratingCount,
        soldQuantity: s.soldQuantity,
        condition: s.condition,
        categoryId: s.categoryId,
        listingTypeId: s.listingTypeId,
        priceLowest30d: s.priceLowest30d,
        priceLowest90d: s.priceLowest90d,
        priceVsLowest90dPct: s.priceVsLowest90dPct,
        habitual30d: s.habitual30d,
        savingsVsHabitualPct: s.savingsVsHabitualPct,
        effectiveDiscountPercent: s.effectiveDiscountPercent,
        suspectedArtificialListPrice: s.suspectedArtificialListPrice,
        priceIntelSource: s.priceIntelSource,
      })
    : {};

  const score = scoreBreakdown
    ? compact({
        total: scoreBreakdown.total,
        discount: scoreBreakdown.discount,
        popularity: scoreBreakdown.popularity,
        rating: scoreBreakdown.rating,
        category: scoreBreakdown.category,
        priceAppeal: scoreBreakdown.priceAppeal,
        historical: scoreBreakdown.historical,
      })
    : {};

  const hasSignals = Object.keys(signals).length > 0;
  const hasScore = Object.keys(score).length > 0;
  if (!hasSignals && !hasScore && !ingestSource) return null;

  return compact({
    v: BOT_META_VERSION,
    capturedAt: new Date().toISOString(),
    source: ingestSource,
    sourceDetail: ingestSourceDetail,
    decision,
    imageFromSource: meta.imageUrl?.trim() ? true : false,
    ...(hasScore ? { score } : {}),
    ...(hasSignals ? { signals } : {}),
  });
}
