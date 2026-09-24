/**
 * Anomaly is a signal. This function does not publish, rank, or mint.
 */

import type { PriceKnowledge } from '@/lib/intelligence/price/summarize';

export type PriceDecisionSignal = 'insufficient' | 'watch' | 'candidate_discount' | 'suspicious_high';

export function priceDecisionSignal(knowledge: PriceKnowledge): {
  anomalyIsDeal: false;
  signal: PriceDecisionSignal;
  because: string;
} {
  if (knowledge.notes.some((note) => note.startsWith('currency_mixed'))) {
    return { anomalyIsDeal: false, signal: 'insufficient', because: 'mixed currency series was refused' };
  }
  if (knowledge.anomaly === 'high') {
    return {
      anomalyIsDeal: false,
      signal: 'suspicious_high',
      because: 'current price sits above the historical band; that is not a discount',
    };
  }
  if (
    knowledge.evidence.samples >= 8 &&
    knowledge.confidence >= 0.5 &&
    knowledge.anomaly === 'low' &&
    (knowledge.discountDepth ?? 0) >= 0.05
  ) {
    return {
      anomalyIsDeal: false,
      signal: 'candidate_discount',
      because: 'low band with measured depth and enough history; publication is a separate decision',
    };
  }
  if (knowledge.evidence.samples >= 2) {
    return {
      anomalyIsDeal: false,
      signal: 'watch',
      because: 'history exists and does not clear the discount bar',
    };
  }
  return { anomalyIsDeal: false, signal: 'insufficient', because: 'not enough snapshots to invent a minimum' };
}
