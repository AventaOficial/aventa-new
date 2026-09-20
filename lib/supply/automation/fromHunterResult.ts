/**
 * Map HunterResult → SupplyAutomationCandidate[] (generic contract).
 * Does not hard-code ChatGPT/Grok/Amazon/ML inside orchestrator logic.
 */

import {
  hunterCandidateToS8Input,
  type HunterResult,
} from '@/lib/supply/hunterBenchmark';
import { opportunityCandidateFromHunterHandoff } from '@/lib/supply/intelligence/fromHunterHandoff';
import type { SupplyAutomationCandidate } from './types';

export type MapHunterResultOptions = {
  /** Max candidates to map (server will also clamp) */
  max?: number;
};

/**
 * Normalize untrusted hunter output into automation candidates.
 * Malformed entries are dropped (fail-closed per candidate).
 */
export function automationCandidatesFromHunterResult(
  result: HunterResult,
  options: MapHunterResultOptions = {},
): SupplyAutomationCandidate[] {
  const max = options.max ?? result.candidates.length;
  const out: SupplyAutomationCandidate[] = [];
  for (const raw of result.candidates) {
    if (out.length >= max) break;
    const handoff = hunterCandidateToS8Input(raw);
    const opportunity = opportunityCandidateFromHunterHandoff(handoff);
    if (!opportunity) continue;
    // Prefer identity URL; attach title from hunter when present
    out.push({
      candidateKey: raw.candidateId || opportunity.url,
      sourceId: result.sourceId,
      hunterId: result.hunterId,
      discoveredAt: raw.discoveredAt ?? result.collectedAt,
      opportunity: {
        ...opportunity,
        title: opportunity.title ?? raw.title,
        imageUrl:
          opportunity.imageUrl ??
          (typeof raw.metadata?.imageUrl === 'string' ? raw.metadata.imageUrl : null),
      },
    });
  }
  return out;
}
