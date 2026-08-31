import type { ModerationTrustResult } from './confidenceBadge';

export type ModerationLevel = 'sprint' | 'review' | 'enforcement';

export function classifyModerationLevel(input: {
  trust: ModerationTrustResult;
  similarCount: number;
  hasPendingReport?: boolean;
  authorBanned?: boolean;
  blockerCount?: number;
}): ModerationLevel {
  if (input.authorBanned || input.hasPendingReport) return 'enforcement';
  if (
    input.trust.level === 'low' ||
    input.similarCount > 0 ||
    (input.blockerCount ?? 0) > 0
  ) {
    return 'review';
  }
  return 'sprint';
}

export const MODERATION_LEVEL_LABELS: Record<ModerationLevel, string> = {
  sprint: 'Sprint',
  review: 'Revisión',
  enforcement: 'Enforcement',
};
