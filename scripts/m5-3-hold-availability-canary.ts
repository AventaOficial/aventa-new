/**
 * M5.3 — Staging canary: VALIDATING → AVAILABLE hold engine.
 * Uses processExpiredRewardHolds only. No payout. No production writes.
 *
 *   npx tsx scripts/m5-3-hold-availability-canary.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
} from '@/lib/wave3';
import { STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { recordConversion } from '@/lib/economy/recordConversion';
import { recordCommission } from '@/lib/economy/recordCommission';
import { settleCommission } from '@/lib/economy/settlement/settleCommission';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import {
  scheduleLedgerRewardAttempt,
  processLedgerRewardAttempt,
} from '@/lib/rewards/ledgerRewardBridge';
import {
  processExpiredRewardHolds,
  cancelReward,
  reverseReward,
} from '@/lib/rewards/rewardsEngine';

const STAMP = String(Date.now());
const TAG = `m53_${STAMP}`;
const OUT = join(process.cwd(), 'scripts', '_m53_reports');
const FORBIDDEN = new Set([
  '0e12ab0d-a285-46eb-90e4-e7ff7dac6146',
  '5323f1aa-6197-4ea1-9fbd-3158b907dc4e',
  '55f0cb32-4573-4cc5-81ad-159e479a924e',
]);
const GROSS = 2500;

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function failClosedFlags() {
  process.env.MONEY_PATH_FROZEN = 'true';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
}

async function headCount(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function ensureParticipatingOffer(sb: SupabaseClient) {
  const { data: unlocked } = await sb
    .from('profiles')
    .select('id, reward_program_unlocked_at')
    .not('reward_program_unlocked_at', 'is', null)
    .limit(20);

  for (const p of unlocked ?? []) {
    const creatorId = (p as { id: string }).id;
    const unlockedAt = (p as { reward_program_unlocked_at: string }).reward_program_unlocked_at;
    const { data: offers } = await sb
      .from('offers')
      .select('id, offer_url, created_at')
      .eq('created_by', creatorId)
      .in('status', ['approved', 'published'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    for (const o of offers ?? []) {
      const offer = o as { id: string; offer_url?: string };
      if (!/amazon\./i.test(offer.offer_url ?? '') && !/\/dp\//i.test(offer.offer_url ?? '')) {
        continue;
      }
      if (!(await isOfferParticipatingInRewards(sb, offer.id))) continue;
      const { data: others } = await sb
        .from('profiles')
        .select('id')
        .neq('id', creatorId)
        .limit(3);
      const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
      if (!clickerId) continue;
      return { ok: true as const, creatorId, clickerId, offerId: offer.id };
    }

    const { data: others } = await sb
      .from('profiles')
      .select('id')
      .neq('id', creatorId)
      .limit(3);
    const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
    if (!clickerId) continue;
    const createdAt = new Date(
      Math.max(Date.parse(unlockedAt) + 60_000, Date.now()),
    ).toISOString();
    const { data: inserted, error } = await sb
      .from('offers')
      .insert({
        title: `[M5.3 ${STAMP}] hold canary Amazon`,
        price: 499,
        image_url: 'https://example.com/m53.jpg',
        store: 'Amazon',
        offer_url: `https://www.amazon.com.mx/dp/B0M53${STAMP.slice(-6)}`,
        status: 'approved',
        created_by: creatorId,
        category: 'general',
        created_at: createdAt,
      })
      .select('id')
      .maybeSingle();
    if (error || !inserted?.id) continue;
    if (!(await isOfferParticipatingInRewards(sb, inserted.id))) continue;
    return { ok: true as const, creatorId, clickerId, offerId: inserted.id };
  }
  return { ok: false as const, reason: 'no_fixture' };
}

async function createValidatingReward(
  sb: SupabaseClient,
  fixtures: { offerId: string; creatorId: string; clickerId: string },
  suffix: string,
): Promise<{ ok: boolean; reason?: string; rewardId?: string; ledgerId?: string }> {
  const click = await recordAttributedClick(sb, {
    offerId: fixtures.offerId,
    clickerUserId: fixtures.clickerId,
    ip: `m53-${suffix}-${STAMP}`,
  });
  if (!click?.clickId) return { ok: false, reason: 'click_failed' };

  const subId = encodeAventaSubId(fixtures.offerId, click.clickId);
  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m53-conv-${suffix}-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: fixtures.offerId,
    rawReference: { m53: true, ascsubtag: subId },
    actor: 'm5_3_canary',
  });
  if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
    return { ok: false, reason: 'conversion_not_attributed' };
  }

  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m53-comm-${suffix}-${STAMP}`,
    grossCommissionCents: GROSS,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    actor: 'm5_3_canary',
  });
  if (!comm?.commissionId) return { ok: false, reason: 'commission_failed' };

  await sb
    .from('affiliate_commissions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', comm.commissionId);

  process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  const settled = await settleCommission(sb, {
    commissionId: comm.commissionId,
    actor: 'm5_3_canary',
  });
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  if (!settled.ok || !settled.ledgerEntryId) {
    return { ok: false, reason: `settle:${settled.reason}` };
  }

  await scheduleLedgerRewardAttempt(sb, {
    ledgerEntryId: settled.ledgerEntryId,
    commissionId: comm.commissionId,
  });

  process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  process.env.MONEY_PATH_FROZEN = 'false';
  const attempt = await processLedgerRewardAttempt(sb, settled.ledgerEntryId);
  if (attempt.outcome !== 'created' || !attempt.rewardId) {
    return { ok: false, reason: `reward:${attempt.outcome}:${attempt.reason}` };
  }
  if (FORBIDDEN.has(attempt.rewardId)) {
    return { ok: false, reason: 'forbidden_reward_id' };
  }

  const { data: reward } = await sb
    .from('creator_rewards')
    .select('id, status, hold_until')
    .eq('id', attempt.rewardId)
    .maybeSingle();
  if (!reward || reward.status !== 'VALIDATING') {
    return { ok: false, reason: 'reward_not_validating' };
  }

  return { ok: true, rewardId: attempt.rewardId, ledgerId: settled.ledgerEntryId };
}

async function setHoldUntil(sb: SupabaseClient, rewardId: string, holdUntil: string) {
  const { error } = await sb
    .from('creator_rewards')
    .update({ hold_until: holdUntil, updated_at: new Date().toISOString() })
    .eq('id', rewardId)
    .eq('status', 'VALIDATING');
  if (error) throw new Error(error.message);
}

async function loadReward(sb: SupabaseClient, id: string) {
  const { data } = await sb
    .from('creator_rewards')
    .select('id, status, hold_until, available_at, ledger_entry_id')
    .eq('id', id)
    .maybeSingle();
  return data as {
    id: string;
    status: string;
    hold_until: string;
    available_at: string | null;
    ledger_entry_id: string;
  } | null;
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  failClosedFlags();

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm5-3-hold-availability-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.3_hold_availability',
    tag: TAG,
    realMoney: false,
    flagsBefore: snapshotWave3Flags(),
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  if (!url.includes(STAGING_SUPABASE_REF) || !key) {
    report.reason = 'staging_credentials_missing';
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const sb = client(url, key);

  try {
    const payoutBefore = {
      reward_payouts: await headCount(sb, 'reward_payouts'),
      payout_intents: await headCount(sb, 'payout_intents'),
    };
    report.payoutBefore = payoutBefore;

    const fixtures = await ensureParticipatingOffer(sb);
    report.fixtures = fixtures;
    if (!fixtures.ok) {
      report.reason = fixtures.reason;
      return;
    }

    // A) future hold
    const future = await createValidatingReward(sb, fixtures, 'fut');
    report.caseA_create = future;
    if (!future.ok || !future.rewardId) {
      report.reason = future.reason ?? 'future_create_failed';
      return;
    }
    const futureHold = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await setHoldUntil(sb, future.rewardId, futureHold);

    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    const futRun = await processExpiredRewardHolds(sb, { limit: 50 });
    const futAfter = await loadReward(sb, future.rewardId);
    report.caseA = {
      rewardId: future.rewardId,
      hold_until: futureHold,
      processReleasedThisId: futRun.releasedIds.includes(future.rewardId),
      status: futAfter?.status,
    };
    if (futAfter?.status !== 'VALIDATING') {
      report.reason = 'caseA_unexpected_unlock';
      return;
    }

    // B) expired hold
    const expired = await createValidatingReward(sb, fixtures, 'exp');
    report.caseB_create = expired;
    if (!expired.ok || !expired.rewardId) {
      report.reason = expired.reason ?? 'expired_create_failed';
      return;
    }
    const pastHold = new Date(Date.now() - 86_400_000).toISOString();
    await setHoldUntil(sb, expired.rewardId, pastHold);

    process.env.MONEY_PATH_FROZEN = 'false';
    const expRun = await processExpiredRewardHolds(sb, { limit: 50 });
    const expAfter = await loadReward(sb, expired.rewardId);
    report.caseB = {
      rewardId: expired.rewardId,
      hold_until: pastHold,
      processed: expRun.processed,
      released: expRun.releasedIds.includes(expired.rewardId),
      status: expAfter?.status,
      available_at: expAfter?.available_at ?? null,
    };
    if (expAfter?.status !== 'AVAILABLE' || !expRun.releasedIds.includes(expired.rewardId)) {
      report.reason = 'caseB_not_available';
      return;
    }

    // C) already AVAILABLE → idempotent
    const again = await processExpiredRewardHolds(sb, { limit: 50 });
    report.caseC = {
      rewardId: expired.rewardId,
      releasedAgain: again.releasedIds.includes(expired.rewardId),
      status: (await loadReward(sb, expired.rewardId))?.status,
    };
    if (report.caseC.releasedAgain || report.caseC.status !== 'AVAILABLE') {
      report.reason = 'caseC_not_idempotent';
      return;
    }

    // D) CANCELLED / REVERSED
    const cancelled = await createValidatingReward(sb, fixtures, 'can');
    const reversed = await createValidatingReward(sb, fixtures, 'rev');
    if (!cancelled.ok || !cancelled.rewardId || !reversed.ok || !reversed.rewardId) {
      report.reason = 'caseD_create_failed';
      return;
    }
    await setHoldUntil(sb, cancelled.rewardId, pastHold);
    await setHoldUntil(sb, reversed.rewardId, pastHold);
    const cancelOk = await cancelReward(sb, cancelled.rewardId, fixtures.creatorId, 'm53_canary');
    const reverseOk = await reverseReward(sb, reversed.rewardId, fixtures.creatorId, 'm53_canary');
    process.env.MONEY_PATH_FROZEN = 'false';
    const termRun = await processExpiredRewardHolds(sb, { limit: 50 });
    const canAfter = await loadReward(sb, cancelled.rewardId);
    const revAfter = await loadReward(sb, reversed.rewardId);
    report.caseD = {
      cancelOk,
      reverseOk,
      cancelledStatus: canAfter?.status,
      reversedStatus: revAfter?.status,
      releasedCancelled: termRun.releasedIds.includes(cancelled.rewardId),
      releasedReversed: termRun.releasedIds.includes(reversed.rewardId),
    };
    if (
      !cancelOk ||
      !reverseOk ||
      canAfter?.status !== 'CANCELLED' ||
      revAfter?.status !== 'REVERSED' ||
      report.caseD.releasedCancelled ||
      report.caseD.releasedReversed
    ) {
      report.reason = 'caseD_terminal_leaked_to_available';
      return;
    }

    // FASE 6 — concurrency on expired VALIDATING
    const race = await createValidatingReward(sb, fixtures, 'race');
    if (!race.ok || !race.rewardId) {
      report.reason = race.reason ?? 'race_create_failed';
      return;
    }
    await setHoldUntil(sb, race.rewardId, pastHold);
    process.env.MONEY_PATH_FROZEN = 'false';
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () => processExpiredRewardHolds(sb, { limit: 50 })),
    );
    const availableTransitionCount = concurrent.reduce(
      (s, r) => s + (r.releasedIds.includes(race.rewardId!) ? 1 : 0),
      0,
    );
    const raceAfter = await loadReward(sb, race.rewardId);
    report.caseConcurrency = {
      rewardId: race.rewardId,
      availableTransitionCount,
      status: raceAfter?.status,
    };
    if (availableTransitionCount !== 1 || raceAfter?.status !== 'AVAILABLE') {
      report.reason = 'concurrency_failed';
      return;
    }

    // FASE 7 — AVAILABLE does not create payout_intent
    const payoutAfter = {
      reward_payouts: await headCount(sb, 'reward_payouts'),
      payout_intents: await headCount(sb, 'payout_intents'),
    };
    report.payoutAfter = payoutAfter;
    report.payoutIntact =
      payoutBefore.reward_payouts === payoutAfter.reward_payouts &&
      payoutBefore.payout_intents === payoutAfter.payout_intents;
    if (!report.payoutIntact) {
      report.reason = 'payout_boundary_violated';
      return;
    }

    const { count: intentsForAvailable } = await sb
      .from('payout_intents')
      .select('*', { count: 'exact', head: true })
      .eq('reward_id', expired.rewardId);
    report.payoutIntentsForAvailableReward = intentsForAvailable ?? 0;
    if ((intentsForAvailable ?? 0) !== 0) {
      report.reason = 'hold_engine_created_payout_intent';
      return;
    }

    report.evidence = {
      futureRemainsValidating: future.rewardId,
      unlockedAvailable: expired.rewardId,
      concurrentAvailable: race.rewardId,
    };
    report.ok = true;
  } catch (e) {
    report.reason = e instanceof Error ? e.message : String(e);
    report.ok = false;
  } finally {
    report.flagsFinal = restoreWave3FailClosedFlags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  }
}

main().catch((e) => {
  restoreWave3FailClosedFlags();
  console.error(e);
  process.exit(1);
});
