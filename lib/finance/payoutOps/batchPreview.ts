/**
 * Lote (preview) — puro. No persiste ni libera nada.
 * docs/SYSTEMS/SYSTEM_payout_operations.md §5
 */

import { evaluatePayeeGates } from './payeeGates';
import type {
  BatchPayeeLine,
  BatchPreview,
  BatchTotals,
  PayoutOpsData,
  PayoutOpsRuntime,
} from './types';

const IN_FLIGHT_INTENT_STATUSES = new Set(['RESERVED', 'SUBMITTED']);

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

export function periodLabelFor(nowIso: string): string {
  const d = new Date(nowIso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function buildPayoutBatchPreview(
  data: PayoutOpsData,
  runtime: PayoutOpsRuntime,
  opts: { minPayoutCents: number; requiredTermsVersion: string },
): BatchPreview {
  const inFlightRewardIds = new Set(
    data.intents.filter((i) => IN_FLIGHT_INTENT_STATUSES.has(i.status)).map((i) => i.reward_id),
  );

  const totals: BatchTotals = {
    payableCents: 0,
    payableCount: 0,
    reviewCents: 0,
    reviewCount: 0,
    blockedCents: 0,
    blockedCount: 0,
    carryCents: 0,
    carryCount: 0,
    inFlightCents: 0,
    inFlightCount: 0,
  };

  const byCreator = new Map<
    string,
    { amount: number; ids: string[]; fraud: Set<string> }
  >();

  for (const r of data.rewards) {
    if (r.status !== 'AVAILABLE') continue;
    if (r.payout_id || inFlightRewardIds.has(r.id)) {
      totals.inFlightCents += r.creator_share_cents;
      totals.inFlightCount += 1;
      continue;
    }
    const cur = byCreator.get(r.creator_id) ?? { amount: 0, ids: [], fraud: new Set<string>() };
    cur.amount += Math.max(0, Math.floor(r.creator_share_cents));
    cur.ids.push(r.id);
    for (const f of toStringArray(r.fraud_flags)) cur.fraud.add(f);
    byCreator.set(r.creator_id, cur);
  }

  const paidByCreator = new Map<string, { count: number; lastPaidAt: string | null }>();
  for (const p of data.payouts) {
    if (p.status !== 'completed') continue;
    const cur = paidByCreator.get(p.user_id) ?? { count: 0, lastPaidAt: null };
    cur.count += 1;
    const at = p.paid_at ?? p.created_at;
    if (!cur.lastPaidAt || Date.parse(at) > Date.parse(cur.lastPaidAt)) cur.lastPaidAt = at;
    paidByCreator.set(p.user_id, cur);
  }
  for (const i of data.intents) {
    if (i.status !== 'SUCCEEDED') continue;
    const cur = paidByCreator.get(i.creator_id) ?? { count: 0, lastPaidAt: null };
    cur.count += 1;
    const at = i.resolved_at ?? i.created_at;
    if (!cur.lastPaidAt || Date.parse(at) > Date.parse(cur.lastPaidAt)) cur.lastPaidAt = at;
    paidByCreator.set(i.creator_id, cur);
  }

  const rewardCreator = new Map(data.rewards.map((r) => [r.id, r.creator_id] as const));
  const clawbackByCreator = new Map<string, number>();
  for (const c of data.clawbacks) {
    if (c.status !== 'pending') continue;
    const creator = c.reward_id ? rewardCreator.get(c.reward_id) : null;
    if (!creator) continue;
    clawbackByCreator.set(
      creator,
      (clawbackByCreator.get(creator) ?? 0) + Math.abs(c.adjustment_amount_cents),
    );
  }

  const lines: BatchPayeeLine[] = [];
  for (const [creatorId, agg] of byCreator) {
    const profile = data.profiles.get(creatorId);
    const paid = paidByCreator.get(creatorId) ?? { count: 0, lastPaidAt: null };
    const gate = evaluatePayeeGates({
      amountCents: agg.amount,
      minPayoutCents: opts.minPayoutCents,
      legalName: profile?.legalName ?? null,
      rfc: profile?.rfc ?? null,
      clabe: profile?.clabe ?? null,
      fiscalUpdatedAt: profile?.fiscalUpdatedAt ?? null,
      termsAcceptedAt: profile?.termsAcceptedAt ?? null,
      termsVersion: profile?.termsVersion ?? null,
      requiredTermsVersion: opts.requiredTermsVersion,
      priorPaidCount: paid.count,
      lastPaidAt: paid.lastPaidAt,
      fraudFlags: [...agg.fraud],
      pendingClawbackCents: clawbackByCreator.get(creatorId) ?? 0,
      rfcDuplicate: !!profile?.rfc && data.duplicateRfcs.has(profile.rfc.toUpperCase()),
    });

    lines.push({
      creatorId,
      displayName: profile?.displayName ?? profile?.legalName ?? null,
      amountCents: agg.amount,
      rewardCount: agg.ids.length,
      rewardIds: agg.ids,
      gate,
    });

    switch (gate.decision) {
      case 'pass':
        totals.payableCents += agg.amount;
        totals.payableCount += 1;
        break;
      case 'review':
        totals.reviewCents += agg.amount;
        totals.reviewCount += 1;
        break;
      case 'fail':
        totals.blockedCents += agg.amount;
        totals.blockedCount += 1;
        break;
      case 'carry':
        totals.carryCents += agg.amount;
        totals.carryCount += 1;
        break;
    }
  }

  const order: Record<BatchPayeeLine['gate']['decision'], number> = {
    pass: 0,
    review: 1,
    fail: 2,
    carry: 3,
  };
  lines.sort(
    (a, b) => order[a.gate.decision] - order[b.gate.decision] || b.amountCents - a.amountCents,
  );

  const releaseBlockers: string[] = [];
  if (runtime.moneyPathFrozen) releaseBlockers.push('money_path_frozen');
  if (!runtime.rewardsProgramActive) releaseBlockers.push('rewards_program_off');
  if (
    runtime.payoutProvider.mode === 'none' ||
    runtime.payoutProvider.mode === 'invalid' ||
    runtime.payoutProvider.mode === 'forbidden_production'
  ) {
    releaseBlockers.push('payout_provider_not_ready');
  }
  if (totals.payableCount === 0) releaseBlockers.push('no_payable_lines');
  if (totals.reviewCount > 0) releaseBlockers.push('review_pending');

  return {
    periodLabel: periodLabelFor(data.now),
    minPayoutCents: opts.minPayoutCents,
    lines,
    totals,
    readyToRelease: releaseBlockers.length === 0,
    releaseBlockers,
  };
}
