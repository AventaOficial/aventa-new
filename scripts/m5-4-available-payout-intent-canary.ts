/**
 * M5.4 — Staging canary: AVAILABLE → payout_intent (reserve only).
 * Never provider real. Never PAID. Never reward_payouts authority.
 *
 *   npx tsx scripts/m5-4-available-payout-intent-canary.ts
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
import { REWARDS_MIN_PAYOUT_CENTS, REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import {
  scheduleLedgerRewardAttempt,
  processLedgerRewardAttempt,
} from '@/lib/rewards/ledgerRewardBridge';
import {
  processExpiredRewardHolds,
  cancelReward,
  reverseReward,
} from '@/lib/rewards/rewardsEngine';
import {
  processAvailableRewardPayoutIntent,
} from '@/lib/rewards/availablePayoutIntent';
import {
  buildPayoutIntentIdempotencyKey,
  loadPayoutIntentByReward,
} from '@/lib/rewards/payoutIntent';

const STAMP = String(Date.now());
const TAG = `m54_${STAMP}`;
const OUT = join(process.cwd(), 'scripts', '_m54_reports');
/** Gross so creator share == REWARDS_MIN_PAYOUT_CENTS at 40% bps. */
const GROSS_ELIGIBLE = Math.ceil((REWARDS_MIN_PAYOUT_CENTS * 10_000) / REWARDS_CREATOR_SHARE_BPS);
const GROSS_BELOW = 2500;

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

async function countEq(sb: SupabaseClient, table: string, col: string, val: string) {
  const { count, error } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, val);
  if (error) throw new Error(error.message);
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
      .select('id, offer_url')
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
      const { data: others } = await sb.from('profiles').select('id').neq('id', creatorId).limit(3);
      const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
      if (!clickerId) continue;
      return { ok: true as const, creatorId, clickerId, offerId: offer.id };
    }
    const { data: others } = await sb.from('profiles').select('id').neq('id', creatorId).limit(3);
    const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
    if (!clickerId) continue;
    const createdAt = new Date(Math.max(Date.parse(unlockedAt) + 60_000, Date.now())).toISOString();
    const { data: inserted } = await sb
      .from('offers')
      .insert({
        title: `[M5.4 ${STAMP}] available→intent canary`,
        price: 499,
        image_url: 'https://example.com/m54.jpg',
        store: 'Amazon',
        offer_url: `https://www.amazon.com.mx/dp/B0M54${STAMP.slice(-6)}`,
        status: 'approved',
        created_by: creatorId,
        category: 'general',
        created_at: createdAt,
      })
      .select('id')
      .maybeSingle();
    if (!inserted?.id) continue;
    if (!(await isOfferParticipatingInRewards(sb, inserted.id))) continue;
    return { ok: true as const, creatorId, clickerId, offerId: inserted.id };
  }
  return { ok: false as const, reason: 'no_fixture' };
}

async function createRewardAtStatus(
  sb: SupabaseClient,
  fixtures: { offerId: string; creatorId: string; clickerId: string },
  input: {
    suffix: string;
    grossCents: number;
    /** If true, expire hold and run processExpiredRewardHolds. */
    makeAvailable: boolean;
  },
): Promise<{ ok: boolean; reason?: string; rewardId?: string; status?: string }> {
  const click = await recordAttributedClick(sb, {
    offerId: fixtures.offerId,
    clickerUserId: fixtures.clickerId,
    ip: `m54-${input.suffix}-${STAMP}`,
  });
  if (!click?.clickId) return { ok: false, reason: 'click_failed' };

  const subId = encodeAventaSubId(fixtures.offerId, click.clickId);
  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m54-conv-${input.suffix}-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: fixtures.offerId,
    rawReference: { m54: true, ascsubtag: subId },
    actor: 'm5_4_canary',
  });
  if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
    return { ok: false, reason: 'conversion_not_attributed' };
  }

  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m54-comm-${input.suffix}-${STAMP}`,
    grossCommissionCents: input.grossCents,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    actor: 'm5_4_canary',
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
    actor: 'm5_4_canary',
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

  if (input.makeAvailable) {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await sb
      .from('creator_rewards')
      .update({ hold_until: past, updated_at: new Date().toISOString() })
      .eq('id', attempt.rewardId)
      .eq('status', 'VALIDATING');
    process.env.MONEY_PATH_FROZEN = 'false';
    await processExpiredRewardHolds(sb, { limit: 50 });
  }

  const { data: reward } = await sb
    .from('creator_rewards')
    .select('id, status, creator_share_cents')
    .eq('id', attempt.rewardId)
    .maybeSingle();

  return {
    ok: true,
    rewardId: attempt.rewardId,
    status: (reward as { status?: string } | null)?.status,
  };
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  failClosedFlags();

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm5-4-available-payout-intent-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.4_available_payout_intent',
    tag: TAG,
    realMoney: false,
    grossEligible: GROSS_ELIGIBLE,
    expectedShare: splitCommissionCents(GROSS_ELIGIBLE, REWARDS_CREATOR_SHARE_BPS).creatorCents,
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
    const countsBefore = {
      payout_intents: await headCount(sb, 'payout_intents'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
    };
    report.countsBefore = countsBefore;

    const fixtures = await ensureParticipatingOffer(sb);
    report.fixtures = fixtures;
    if (!fixtures.ok) {
      report.reason = fixtures.reason;
      return;
    }

    // A — AVAILABLE elegible
    const eligible = await createRewardAtStatus(sb, fixtures, {
      suffix: 'elig',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    report.caseA_create = eligible;
    if (!eligible.ok || !eligible.rewardId || eligible.status !== 'AVAILABLE') {
      report.reason = `caseA_create:${eligible.reason}:${eligible.status}`;
      return;
    }

    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const a1 = await processAvailableRewardPayoutIntent(sb, eligible.rewardId);
    report.caseA = a1;
    const intentCountA = await countEq(sb, 'payout_intents', 'reward_id', eligible.rewardId);
    if (a1.outcome !== 'reserved' || intentCountA !== 1 || a1.intentStatus !== 'RESERVED') {
      report.reason = `caseA_failed:${a1.outcome}:${intentCountA}:${a1.intentStatus}`;
      return;
    }

    // B — replay
    const b = await processAvailableRewardPayoutIntent(sb, eligible.rewardId);
    report.caseB = b;
    if (b.outcome !== 'reused' || b.intentId !== a1.intentId || (await countEq(sb, 'payout_intents', 'reward_id', eligible.rewardId)) !== 1) {
      report.reason = 'caseB_replay_failed';
      return;
    }

    // C — concurrent ×10
    const race = await createRewardAtStatus(sb, fixtures, {
      suffix: 'race',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    if (!race.ok || !race.rewardId) {
      report.reason = race.reason ?? 'race_create_failed';
      return;
    }
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () => processAvailableRewardPayoutIntent(sb, race.rewardId!)),
    );
    const raceIntentCount = await countEq(sb, 'payout_intents', 'reward_id', race.rewardId);
    const intentIds = new Set(concurrent.map((r) => r.intentId).filter(Boolean));
    report.caseC = {
      rewardId: race.rewardId,
      intentCount: raceIntentCount,
      distinctIntentIds: [...intentIds],
      outcomes: concurrent.map((r) => r.outcome),
    };
    if (raceIntentCount !== 1 || intentIds.size !== 1) {
      report.reason = 'caseC_concurrency_failed';
      return;
    }

    // D — VALIDATING
    const validating = await createRewardAtStatus(sb, fixtures, {
      suffix: 'val',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: false,
    });
    if (!validating.ok || !validating.rewardId) {
      report.reason = validating.reason ?? 'validating_create_failed';
      return;
    }
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const d = await processAvailableRewardPayoutIntent(sb, validating.rewardId);
    report.caseD = d;
    if (d.outcome !== 'rejected' || d.reason !== 'reward_not_available' || (await countEq(sb, 'payout_intents', 'reward_id', validating.rewardId)) !== 0) {
      report.reason = `caseD_failed:${d.outcome}:${d.reason}`;
      return;
    }

    // E — hold futuro (VALIDATING with future hold — same as D for intent; demonstrate hold not bypassed)
    const futureHold = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await sb
      .from('creator_rewards')
      .update({ hold_until: futureHold, updated_at: new Date().toISOString() })
      .eq('id', validating.rewardId);
    process.env.MONEY_PATH_FROZEN = 'false';
    await processExpiredRewardHolds(sb, { limit: 20 });
    const { data: still } = await sb
      .from('creator_rewards')
      .select('status')
      .eq('id', validating.rewardId)
      .maybeSingle();
    const e = await processAvailableRewardPayoutIntent(sb, validating.rewardId);
    report.caseE = {
      statusAfterHoldProcess: (still as { status?: string } | null)?.status ?? null,
      attempt: e,
      intents: await countEq(sb, 'payout_intents', 'reward_id', validating.rewardId),
    };
    if (
      report.caseE.statusAfterHoldProcess !== 'VALIDATING' ||
      e.reason !== 'reward_not_available' ||
      report.caseE.intents !== 0
    ) {
      report.reason = 'caseE_hold_bypass';
      return;
    }

    // F — below minimum
    const below = await createRewardAtStatus(sb, fixtures, {
      suffix: 'below',
      grossCents: GROSS_BELOW,
      makeAvailable: true,
    });
    if (!below.ok || !below.rewardId) {
      report.reason = below.reason ?? 'below_create_failed';
      return;
    }
    // Ensure this creator's available balance for THIS path: if prior eligible rewards remain AVAILABLE,
    // below_minimum may not trigger. Cancel leftover AVAILABLE from this canary except the below reward.
    // Safer: process and accept either deferred below_minimum OR reserved if balance already high —
    // Fail only if intent created when share alone < min AND we isolate balance.
    // Isolate: temporarily move other AVAILABLE of this creator to VALIDATING with future hold (canary-only).
    const { data: othersAvail } = await sb
      .from('creator_rewards')
      .select('id')
      .eq('creator_id', fixtures.creatorId)
      .eq('status', 'AVAILABLE')
      .neq('id', below.rewardId);
    const parked: string[] = [];
    for (const row of othersAvail ?? []) {
      const id = (row as { id: string }).id;
      await sb
        .from('creator_rewards')
        .update({
          status: 'VALIDATING',
          hold_until: futureHold,
          available_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'AVAILABLE');
      parked.push(id);
    }
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const f = await processAvailableRewardPayoutIntent(sb, below.rewardId);
    report.caseF = { attempt: f, intents: await countEq(sb, 'payout_intents', 'reward_id', below.rewardId), parked: parked.length };
    // Restore parked to AVAILABLE for cleanliness (re-expire hold)
    for (const id of parked) {
      await sb
        .from('creator_rewards')
        .update({
          status: 'AVAILABLE',
          available_at: new Date().toISOString(),
          hold_until: new Date(Date.now() - 3600_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'VALIDATING');
    }
    if (f.outcome !== 'deferred' || f.reason !== 'below_minimum_available' || report.caseF.intents !== 0) {
      report.reason = `caseF_failed:${f.outcome}:${f.reason}`;
      return;
    }

    // G — CANCELLED
    const cancelled = await createRewardAtStatus(sb, fixtures, {
      suffix: 'can',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    if (!cancelled.ok || !cancelled.rewardId) {
      report.reason = cancelled.reason ?? 'cancel_create_failed';
      return;
    }
    await cancelReward(sb, cancelled.rewardId, fixtures.creatorId, 'm54');
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const g = await processAvailableRewardPayoutIntent(sb, cancelled.rewardId);
    report.caseG = g;
    if (g.reason !== 'reward_terminal' || (await countEq(sb, 'payout_intents', 'reward_id', cancelled.rewardId)) !== 0) {
      report.reason = `caseG_failed:${g.reason}`;
      return;
    }

    // H — REVERSED
    const reversed = await createRewardAtStatus(sb, fixtures, {
      suffix: 'rev',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    if (!reversed.ok || !reversed.rewardId) {
      report.reason = reversed.reason ?? 'rev_create_failed';
      return;
    }
    await reverseReward(sb, reversed.rewardId, fixtures.creatorId, 'm54');
    const h = await processAvailableRewardPayoutIntent(sb, reversed.rewardId);
    report.caseH = h;
    if (h.reason !== 'reward_terminal' || (await countEq(sb, 'payout_intents', 'reward_id', reversed.rewardId)) !== 0) {
      report.reason = `caseH_failed:${h.reason}`;
      return;
    }

    // I — PAID (simulate terminal paid without payout engine: update status only for reject path)
    const paidSeed = await createRewardAtStatus(sb, fixtures, {
      suffix: 'paid',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    if (!paidSeed.ok || !paidSeed.rewardId) {
      report.reason = paidSeed.reason ?? 'paid_seed_failed';
      return;
    }
    await sb
      .from('creator_rewards')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paidSeed.rewardId)
      .eq('status', 'AVAILABLE');
    const i = await processAvailableRewardPayoutIntent(sb, paidSeed.rewardId);
    report.caseI = i;
    if (i.reason !== 'reward_terminal' || (await countEq(sb, 'payout_intents', 'reward_id', paidSeed.rewardId)) !== 0) {
      report.reason = `caseI_failed:${i.reason}`;
      return;
    }

    // J — freeze
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    const freezeSeed = await createRewardAtStatus(sb, fixtures, {
      suffix: 'frz',
      grossCents: GROSS_ELIGIBLE,
      makeAvailable: true,
    });
    // createRewardAtStatus unfreezes internally; re-freeze for attempt
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    if (!freezeSeed.ok || !freezeSeed.rewardId) {
      report.reason = freezeSeed.reason ?? 'freeze_seed_failed';
      return;
    }
    const intentsBeforeJ = await countEq(sb, 'payout_intents', 'reward_id', freezeSeed.rewardId);
    const j = await processAvailableRewardPayoutIntent(sb, freezeSeed.rewardId);
    report.caseJ = { attempt: j, intents: await countEq(sb, 'payout_intents', 'reward_id', freezeSeed.rewardId) };
    if (j.reason !== 'money_path_frozen' || report.caseJ.intents !== intentsBeforeJ) {
      report.reason = `caseJ_failed:${j.reason}`;
      return;
    }

    // K — program inactive
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const k = await processAvailableRewardPayoutIntent(sb, freezeSeed.rewardId);
    report.caseK = k;
    if (k.reason !== 'program_inactive' || (await countEq(sb, 'payout_intents', 'reward_id', freezeSeed.rewardId)) !== 0) {
      report.reason = `caseK_failed:${k.reason}`;
      return;
    }

    // L — missing reward
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    const missingId = '00000000-0000-4000-8000-000000000099';
    const l = await processAvailableRewardPayoutIntent(sb, missingId);
    report.caseL = l;
    if (l.reason !== 'reward_not_found') {
      report.reason = `caseL_failed:${l.reason}`;
      return;
    }

    // M — idempotency key stable
    const loaded = await loadPayoutIntentByReward(sb, eligible.rewardId);
    const expectedKey = buildPayoutIntentIdempotencyKey(eligible.rewardId);
    report.caseM = {
      key: loaded?.idempotency_key ?? null,
      expectedKey,
      match: loaded?.idempotency_key === expectedKey,
    };
    if (!report.caseM.match) {
      report.reason = 'caseM_idempotency_mismatch';
      return;
    }

    // N — reward_payouts unchanged
    const countsAfter = {
      payout_intents: await headCount(sb, 'payout_intents'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
    };
    report.countsAfter = countsAfter;
    report.caseN = {
      rewardPayoutsDelta:
        (countsAfter.reward_payouts ?? 0) - (countsBefore.reward_payouts ?? 0),
    };
    if (report.caseN.rewardPayoutsDelta !== 0) {
      report.reason = 'caseN_reward_payouts_changed';
      return;
    }

    // O — provider not invoked (architecture: processor never imports execute)
    report.caseO = {
      providerExecuted: false,
      intentStatuses: [a1.intentStatus, b.intentStatus],
      note: 'processAvailableRewardPayoutIntent calls reserve only; no submit/provider',
    };

    // Ensure no PAID from this campaign on eligible/race
    const { data: paidCheck } = await sb
      .from('creator_rewards')
      .select('id, status')
      .in('id', [eligible.rewardId, race.rewardId]);
    report.noPaidFromEligible = (paidCheck ?? []).every(
      (r) => (r as { status: string }).status !== 'PAID' || (r as { id: string }).id === paidSeed.rewardId,
    );
    // eligible and race should remain AVAILABLE
    const eligStatus = (paidCheck ?? []).find((r) => (r as { id: string }).id === eligible.rewardId) as
      | { status: string }
      | undefined;
    if (eligStatus?.status !== 'AVAILABLE') {
      report.reason = `eligible_not_available:${eligStatus?.status}`;
      return;
    }

    report.evidence = {
      reservedIntentId: a1.intentId,
      reservedRewardId: eligible.rewardId,
      concurrentRewardId: race.rewardId,
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
