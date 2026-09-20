import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { scoreCategoryPolicy } from '@/lib/discovery/categoryPolicies';
import {
  evaluateNegativeMemory,
  negativeMemoryScoreMultiplier,
} from './evaluateNegativeMemory';
import type { NegativeMemoryDecision, NegativeMemoryEvent } from './types';
import { selectDiverseShortlist, sourceQualityMultiplier } from '../diversity';

export type DiscoveryIntelCandidate = {
  /** Stable id for diversity (url or fingerprint). */
  id: string;
  url: string;
  title: string;
  score: number;
  source?: string | null;
  category?: string | null;
  discountPercent?: number | null;
  price?: number | null;
};

export type DiscoveryIntelResult<T extends DiscoveryIntelCandidate> = {
  shortlist: T[];
  suppressed: Array<{ id: string; fingerprint: string; reason: string }>;
  penalized: Array<{ id: string; fingerprint: string; reason: string; multiplier: number }>;
  decisions: Map<string, NegativeMemoryDecision>;
};

/**
 * candidate → negative memory → ALLOW|PENALIZE|SUPPRESS → diversity shortlist
 *
 * Pure ranking layer. Does not insert. Does not invent scrapers.
 */
export function applyDiscoveryIntelligence<T extends DiscoveryIntelCandidate>(params: {
  candidates: readonly T[];
  eventsByFingerprint: Map<string, NegativeMemoryEvent[]>;
  limit: number;
  now?: Date;
}): DiscoveryIntelResult<T> {
  const now = params.now ?? new Date();
  const decisions = new Map<string, NegativeMemoryDecision>();
  const suppressed: DiscoveryIntelResult<T>['suppressed'] = [];
  const penalized: DiscoveryIntelResult<T>['penalized'] = [];

  const scored: Array<T & { score: number }> = [];

  for (const c of params.candidates) {
    const fp = strongProductFingerprintForUrl(c.url);
    const events = fp ? params.eventsByFingerprint.get(fp) ?? [] : [];
    const decision = fp
      ? evaluateNegativeMemory({ fingerprint: fp, events, now })
      : ({
          level: 'ALLOW' as const,
          fingerprint: '',
          reason: 'no_strong_fingerprint',
          rejectCount: 0,
          spamCount: 0,
          seenBefore: false,
          suppressTtlRemainingMs: null,
          lastStrongSignalAt: null,
        } satisfies NegativeMemoryDecision);

    if (fp) decisions.set(fp, decision);

    if (decision.level === 'SUPPRESS') {
      suppressed.push({
        id: c.id,
        fingerprint: fp ?? '',
        reason: decision.reason,
      });
      continue;
    }

    const nmMul = negativeMemoryScoreMultiplier(decision);
    const srcMul = sourceQualityMultiplier(c.source);
    const cat = scoreCategoryPolicy({
      title: c.title,
      category: c.category,
      discountPercent: c.discountPercent,
      price: c.price,
    });

    if (decision.level === 'PENALIZE') {
      penalized.push({
        id: c.id,
        fingerprint: fp ?? '',
        reason: decision.reason,
        multiplier: nmMul,
      });
    }

    scored.push({
      ...c,
      score: c.score * nmMul * srcMul * cat.multiplier,
    });
  }

  const shortlist = selectDiverseShortlist(scored, params.limit);

  return { shortlist, suppressed, penalized, decisions };
}
