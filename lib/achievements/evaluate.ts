import { activeAchievements } from './catalog';
import { blackFridayWindowOpen, seasonWindowOpen } from './calendar';
import type { AchievementDefinition, AchievementRule, UserFacts } from './types';

export type AchievementProjection = {
  code: string;
  progress: number;
  target: number;
  percent: number;
  unlocked: boolean;
  approvalRate: number | null;
};

function ratio(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function approvalRate(facts: UserFacts): number | null {
  const evaluated = facts.approvedOffers + facts.rejectedOffers;
  if (evaluated <= 0) return null;
  return facts.approvedOffers / evaluated;
}

function projectRule(rule: AchievementRule, facts: UserFacts): Omit<AchievementProjection, 'code'> {
  switch (rule.type) {
    case 'approved_offers':
      return { progress: facts.approvedOffers, target: rule.target, percent: ratio(facts.approvedOffers, rule.target), unlocked: facts.approvedOffers >= rule.target, approvalRate: null };
    case 'clean_approvals':
      return { progress: facts.cleanApprovals, target: rule.target, percent: ratio(facts.cleanApprovals, rule.target), unlocked: facts.cleanApprovals >= rule.target, approvalRate: null };
    case 'quality_offers':
      return { progress: facts.qualityOffers, target: rule.target, percent: ratio(facts.qualityOffers, rule.target), unlocked: facts.qualityOffers >= rule.target, approvalRate: null };
    case 'received_votes':
      return { progress: facts.receivedPositiveVotes, target: rule.target, percent: ratio(facts.receivedPositiveVotes, rule.target), unlocked: facts.receivedPositiveVotes >= rule.target, approvalRate: null };
    case 'single_offer_votes':
      return { progress: facts.maxVotesOnSingleOffer, target: rule.target, percent: ratio(facts.maxVotesOnSingleOffer, rule.target), unlocked: facts.maxVotesOnSingleOffer >= rule.target, approvalRate: null };
    case 'useful_comments':
      return { progress: facts.usefulCommentsReceived, target: rule.target, percent: ratio(facts.usefulCommentsReceived, rule.target), unlocked: facts.usefulCommentsReceived >= rule.target, approvalRate: null };
    case 'conversations':
      return { progress: facts.validConversations, target: rule.target, percent: ratio(facts.validConversations, rule.target), unlocked: facts.validConversations >= rule.target, approvalRate: null };
    case 'distinct_days':
      return { progress: facts.distinctContributionDays, target: rule.target, percent: ratio(facts.distinctContributionDays, rule.target), unlocked: facts.distinctContributionDays >= rule.target, approvalRate: null };
    case 'consecutive_days':
      return { progress: facts.longestConsecutiveDays, target: rule.target, percent: ratio(facts.longestConsecutiveDays, rule.target), unlocked: facts.longestConsecutiveDays >= rule.target, approvalRate: null };
    case 'level':
      return { progress: facts.reputationLevel, target: rule.target, percent: ratio(facts.reputationLevel, rule.target), unlocked: facts.reputationLevel >= rule.target, approvalRate: null };
    case 'dawn':
      return flag(facts.dawnExceptional);
    case 'night':
      return flag(facts.nightExceptional);
    case 'flash':
      return flag(facts.flashHunter);
    case 'black_friday':
      return flag(facts.blackFridayHunter);
    case 'season':
      return flag(facts.seasonHunter);
    case 'secret':
      return flag(facts.secretOffer);
    case 'approval_rate': {
      const rate = approvalRate(facts);
      const countReady = facts.approvedOffers >= rule.minOffers;
      const rateReady = rate != null && rate + 1e-9 >= rule.minRate;
      const countPercent = ratio(facts.approvedOffers, rule.minOffers);
      const ratePercent = rate == null ? 0 : ratio(rate, rule.minRate);
      const percent = countReady && rateReady ? 100 : Math.min(99, Math.min(countPercent, ratePercent));
      return {
        progress: facts.approvedOffers,
        target: rule.minOffers,
        percent,
        unlocked: countReady && rateReady,
        approvalRate: rate,
      };
    }
    default:
      return flag(false);
  }
}

function flag(done: boolean): Omit<AchievementProjection, 'code'> {
  return {
    progress: done ? 1 : 0,
    target: 1,
    percent: done ? 100 : 0,
    unlocked: done,
    approvalRate: null,
  };
}

export function projectAchievement(definition: AchievementDefinition, facts: UserFacts): AchievementProjection {
  if (facts.banned || !definition.isActive) {
    return { code: definition.code, progress: 0, target: 1, percent: 0, unlocked: false, approvalRate: null };
  }
  return { code: definition.code, ...projectRule(definition.rule, facts) };
}

export function projectAchievements(facts: UserFacts): AchievementProjection[] {
  return activeAchievements().map((definition) => projectAchievement(definition, facts));
}

export function achievementIsConcealed(
  definition: AchievementDefinition,
  unlocked: boolean,
  now = new Date(),
): boolean {
  if (!definition.isHidden || unlocked) return false;
  if (definition.reveal === 'during_window') {
    if (definition.rule.type === 'black_friday' && blackFridayWindowOpen(now)) return false;
    if (definition.rule.type === 'season' && seasonWindowOpen(now)) return false;
  }
  return true;
}

/** XP de un desbloqueo nuevo. Si ya se entregó, devuelve 0. */
export function claimAchievementXp(
  grantedKeys: Set<string>,
  userId: string,
  code: string,
  amount: number,
): number {
  if (amount <= 0) return 0;
  const key = `${userId}:${code}`;
  if (grantedKeys.has(key)) return 0;
  grantedKeys.add(key);
  return amount;
}
