/**
 * M5.2 — Staging E2E: settlement → ledger → bridge → creator_reward.
 * Architecture D only. No payout. No production writes. No DDL.
 *
 *   npx tsx scripts/m5-2-settlement-reward-bridge-canary.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
} from '@/lib/wave3';
import {
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  extractSupabaseProjectRef,
} from '@/lib/supabase/projectRefs';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { recordConversion } from '@/lib/economy/recordConversion';
import { recordCommission } from '@/lib/economy/recordCommission';
import { settleCommission } from '@/lib/economy/settlement/settleCommission';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import {
  scheduleLedgerRewardAttempt,
  processLedgerRewardAttempt,
  reconcileLedgerRewardBridge,
  readLedgerRewardOutcome,
} from '@/lib/rewards/ledgerRewardBridge';

const STAMP = String(Date.now());
const TAG = `m52_${STAMP}`;
const OUT = join(process.cwd(), 'scripts', '_m52_reports');
const FORBIDDEN_REWARD = '0e12ab0d-a285-46eb-90e4-e7ff7dac6146';
const GROSS_CENTS = 2500;

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

async function countEq(
  sb: SupabaseClient,
  table: string,
  col: string,
  val: string,
): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, val);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function ensureParticipatingOffer(sb: SupabaseClient): Promise<{
  ok: boolean;
  reason?: string;
  creatorId?: string;
  clickerId?: string;
  offerId?: string;
}> {
  const { data: unlocked } = await sb
    .from('profiles')
    .select('id, reward_program_unlocked_at, welcome_offer_id')
    .not('reward_program_unlocked_at', 'is', null)
    .limit(20);

  for (const p of unlocked ?? []) {
    const creatorId = (p as { id: string }).id;
    const unlockedAt = (p as { reward_program_unlocked_at: string }).reward_program_unlocked_at;

    const { data: offers } = await sb
      .from('offers')
      .select('id, created_by, status, created_at, offer_url')
      .eq('created_by', creatorId)
      .in('status', ['approved', 'published'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    for (const o of offers ?? []) {
      const offer = o as { id: string; offer_url?: string };
      const url = offer.offer_url ?? '';
      if (!/amazon\./i.test(url) && !/\/dp\//i.test(url)) continue;
      if (!(await isOfferParticipatingInRewards(sb, offer.id))) continue;

      const { data: others } = await sb
        .from('profiles')
        .select('id')
        .neq('id', creatorId)
        .limit(5);
      const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
      if (!clickerId) continue;

      return { ok: true, creatorId, clickerId, offerId: offer.id };
    }

    // Create post-unlock Amazon offer for this unlocked creator (M3.1 pattern).
    const { data: others } = await sb
      .from('profiles')
      .select('id')
      .neq('id', creatorId)
      .limit(5);
    const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
    if (!clickerId) continue;

    const asin = `B0M52${STAMP.slice(-6)}`;
    const offerUrl = `https://www.amazon.com.mx/dp/${asin}`;
    const createdAt = new Date(
      Math.max(Date.parse(unlockedAt) + 60_000, Date.now()),
    ).toISOString();
    const { data: inserted, error } = await sb
      .from('offers')
      .insert({
        title: `[M5.2 ${STAMP}] Rewards bridge canary Amazon`,
        price: 499,
        image_url: 'https://example.com/m52.jpg',
        store: 'Amazon',
        offer_url: offerUrl,
        status: 'approved',
        created_by: creatorId,
        category: 'general',
        created_at: createdAt,
      })
      .select('id')
      .maybeSingle();
    if (error || !inserted?.id) {
      return { ok: false, reason: `offer_insert_failed:${error?.message ?? 'null'}` };
    }
    if (!(await isOfferParticipatingInRewards(sb, inserted.id))) {
      return { ok: false, reason: 'offer_not_participating_after_insert', offerId: inserted.id };
    }
    return { ok: true, creatorId, clickerId, offerId: inserted.id };
  }

  return { ok: false, reason: 'no_unlocked_participating_offer' };
}

async function buildSettledLedger(
  sb: SupabaseClient,
  input: {
    offerId: string;
    creatorId: string;
    clickerUserId: string | null;
    suffix: string;
    grossCents?: number;
  },
): Promise<{
  ok: boolean;
  reason?: string;
  clickId?: string;
  conversionId?: string;
  commissionId?: string;
  ledgerEntryId?: string;
  ledger?: Record<string, unknown> | null;
}> {
  const click = await recordAttributedClick(sb, {
    offerId: input.offerId,
    clickerUserId: input.clickerUserId,
    ip: `m52-${input.suffix}-${STAMP}`,
  });
  if (!click?.clickId) return { ok: false, reason: 'click_failed' };

  const subId = encodeAventaSubId(input.offerId, click.clickId);
  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m52-conv-${input.suffix}-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: input.offerId,
    rawReference: { m52: true, ascsubtag: subId },
    actor: 'm5_2_canary',
  });
  if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
    return { ok: false, reason: 'conversion_not_attributed', clickId: click.clickId };
  }

  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m52-comm-${input.suffix}-${STAMP}`,
    grossCommissionCents: input.grossCents ?? GROSS_CENTS,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    actor: 'm5_2_canary',
  });
  if (!comm?.commissionId) {
    return { ok: false, reason: 'commission_failed', conversionId: conv.conversionId };
  }

  await sb
    .from('affiliate_commissions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', comm.commissionId);

  process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';

  const settled = await settleCommission(sb, {
    commissionId: comm.commissionId,
    actor: 'm5_2_canary',
  });

  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';

  if (!settled.ok || !settled.ledgerEntryId) {
    return {
      ok: false,
      reason: `settle_failed:${settled.reason}`,
      commissionId: comm.commissionId,
    };
  }
  if (settled.createdCreatorReward) {
    return { ok: false, reason: 'settle_created_reward_forbidden' };
  }

  const { data: ledger } = await sb
    .from('affiliate_ledger_entries')
    .select(
      'id, click_id, offer_id, creator_id, tracking_tag, attributable, attribution_method, attribution_confidence, network, amount_cents, currency, status, external_ref, notes, meta',
    )
    .eq('id', settled.ledgerEntryId)
    .maybeSingle();

  return {
    ok: true,
    clickId: click.clickId,
    conversionId: conv.conversionId,
    commissionId: comm.commissionId,
    ledgerEntryId: settled.ledgerEntryId,
    ledger: ledger as Record<string, unknown> | null,
  };
}

function ledgerAttributionOk(
  ledger: Record<string, unknown> | null | undefined,
  expect: { clickId: string; offerId: string; creatorId: string },
): boolean {
  if (!ledger) return false;
  return (
    ledger.click_id === expect.clickId &&
    ledger.offer_id === expect.offerId &&
    ledger.creator_id === expect.creatorId &&
    ledger.attributable === true &&
    ledger.attribution_method === 'sub_id' &&
    ledger.attribution_confidence === 'high' &&
    typeof ledger.tracking_tag === 'string' &&
    String(ledger.tracking_tag).includes(expect.offerId)
  );
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  failClosedFlags();

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm5-2-settlement-reward-bridge-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.2_settlement_reward_bridge_e2e',
    tag: TAG,
    realMoney: false,
    forbiddenRewardUnused: FORBIDDEN_REWARD,
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

  const prodUrl =
    process.env.PRODUCTION_SUPABASE_URL ??
    process.env.AVENTA_PRODUCTION_SUPABASE_URL ??
    `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
  const prodKey =
    process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.AVENTA_PRODUCTION_SERVICE_ROLE_KEY ??
    '';

  try {
    // ── FASE 1 PRECHECK ──
    const precheckFlags = snapshotWave3Flags();
    report.precheck = {
      moneyFrozen: precheckFlags.moneyFrozen === true,
      rewardsOff: precheckFlags.rewardsOn === false,
      commissionOff: precheckFlags.commissionOn === false,
      settlementOff: precheckFlags.settlementOn === false,
    };
    if (
      !report.precheck.moneyFrozen ||
      !report.precheck.rewardsOff ||
      !report.precheck.commissionOff ||
      !report.precheck.settlementOff
    ) {
      report.reason = 'precheck_flags_not_fail_closed';
      return;
    }

    const countsBefore = {
      creator_rewards: await headCount(sb, 'creator_rewards'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
      payout_intents: await headCount(sb, 'payout_intents'),
      ledger_settlements: await headCount(sb, 'ledger_settlements'),
    };
    report.countsBefore = countsBefore;

    let prodBefore: Record<string, number | null> | null = null;
    if (prodKey && extractSupabaseProjectRef(prodUrl) === PRODUCTION_SUPABASE_REF) {
      const prod = client(prodUrl, prodKey);
      prodBefore = {
        creator_rewards: await headCount(prod, 'creator_rewards'),
        reward_payouts: await headCount(prod, 'reward_payouts'),
        payout_intents: await headCount(prod, 'payout_intents'),
      };
    }
    report.prodBefore = prodBefore;

    const fixtures = await ensureParticipatingOffer(sb);
    report.fixtures = fixtures;
    if (!fixtures.ok || !fixtures.offerId || !fixtures.creatorId || !fixtures.clickerId) {
      report.reason = fixtures.reason ?? 'fixture_failed';
      return;
    }

    // ── FASE 2 CANONICAL CHAIN ──
    const chain = await buildSettledLedger(sb, {
      offerId: fixtures.offerId,
      creatorId: fixtures.creatorId,
      clickerUserId: fixtures.clickerId,
      suffix: 'pos',
    });
    report.chain = {
      ok: chain.ok,
      reason: chain.reason ?? null,
      clickId: chain.clickId ?? null,
      conversionId: chain.conversionId ?? null,
      commissionId: chain.commissionId ?? null,
      ledgerEntryId: chain.ledgerEntryId ?? null,
      ledgerAttribution: chain.ledger
        ? {
            click_id: chain.ledger.click_id,
            offer_id: chain.ledger.offer_id,
            creator_id: chain.ledger.creator_id,
            attributable: chain.ledger.attributable,
            attribution_method: chain.ledger.attribution_method,
            attribution_confidence: chain.ledger.attribution_confidence,
            tracking_tag: chain.ledger.tracking_tag,
            amount_cents: chain.ledger.amount_cents,
            currency: chain.ledger.currency,
          }
        : null,
    };
    if (!chain.ok || !chain.ledgerEntryId || !chain.clickId) {
      report.reason = chain.reason ?? 'chain_failed';
      return;
    }
    if (chain.ledgerEntryId === FORBIDDEN_REWARD) {
      report.reason = 'forbidden_id_collision';
      return;
    }
    if (
      !ledgerAttributionOk(chain.ledger, {
        clickId: chain.clickId,
        offerId: fixtures.offerId,
        creatorId: fixtures.creatorId,
      })
    ) {
      report.reason = 'ledger_attribution_projection_failed';
      return;
    }

    const existingRewardOnLedger = await countEq(
      sb,
      'creator_rewards',
      'ledger_entry_id',
      chain.ledgerEntryId,
    );
    if (existingRewardOnLedger !== 0) {
      report.reason = 'ledger_already_has_reward';
      return;
    }

    await scheduleLedgerRewardAttempt(sb, {
      ledgerEntryId: chain.ledgerEntryId,
      commissionId: chain.commissionId ?? null,
    });

    // ── FASE 3 NEGATIVE CONTROL ──
    failClosedFlags();
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    const negative = await processLedgerRewardAttempt(sb, chain.ledgerEntryId);
    report.negativeControl = negative;
    const negRewards = await countEq(sb, 'creator_rewards', 'ledger_entry_id', chain.ledgerEntryId);
    if (
      negative.outcome !== 'deferred' ||
      (negative.reason !== 'program_inactive' && negative.reason !== 'money_path_frozen') ||
      negRewards !== 0
    ) {
      report.reason = 'negative_control_failed';
      return;
    }

    // ── FASE 4 POSITIVE CANARY ──
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';

    const positive = await processLedgerRewardAttempt(sb, chain.ledgerEntryId);
    report.positive = positive;

    if (positive.outcome !== 'created' || !positive.rewardId) {
      report.reason = `positive_create_failed:${positive.outcome}:${positive.reason}`;
      return;
    }
    if (positive.rewardId === FORBIDDEN_REWARD) {
      report.reason = 'reused_forbidden_reward';
      return;
    }

    const { data: reward } = await sb
      .from('creator_rewards')
      .select(
        'id, creator_id, offer_id, ledger_entry_id, status, gross_commission_cents, creator_share_cents, currency',
      )
      .eq('id', positive.rewardId)
      .maybeSingle();

    const expectedShare = splitCommissionCents(GROSS_CENTS, REWARDS_CREATOR_SHARE_BPS).creatorCents;
    const rewardOk =
      reward &&
      reward.ledger_entry_id === chain.ledgerEntryId &&
      reward.creator_id === fixtures.creatorId &&
      reward.offer_id === fixtures.offerId &&
      reward.status === 'VALIDATING' &&
      Number(reward.gross_commission_cents) === GROSS_CENTS &&
      Number(reward.creator_share_cents) === expectedShare &&
      String(reward.currency).toUpperCase() === 'MXN';

    report.reward = reward;
    report.rewardOk = Boolean(rewardOk);
    if (!rewardOk) {
      report.reason = 'reward_row_mismatch';
      return;
    }

    const settlements = await countEq(
      sb,
      'ledger_settlements',
      'ledger_entry_id',
      chain.ledgerEntryId,
    );
    report.ledgerSettlements = settlements;
    if (settlements !== 1) {
      report.reason = `ledger_settlements_count:${settlements}`;
      return;
    }

    const { data: audits } = await sb
      .from('reward_audit_log')
      .select('event_type, entity_id')
      .eq('entity_id', positive.rewardId)
      .eq('event_type', 'reward_created')
      .limit(5);
    report.rewardCreatedAudit = (audits ?? []).length;
    if ((audits ?? []).length < 1) {
      report.reason = 'missing_reward_created_audit';
      return;
    }

    // ── FASE 5 IDEMPOTENCY ──
    const replay = await processLedgerRewardAttempt(sb, chain.ledgerEntryId);
    report.idempotencyReplay = replay;
    if (
      !replay.terminal ||
      (replay.outcome !== 'duplicate' && replay.outcome !== 'created')
    ) {
      report.reason = 'idempotency_replay_failed';
      return;
    }

    const concurrent = await Promise.all(
      Array.from({ length: 10 }, () => processLedgerRewardAttempt(sb, chain.ledgerEntryId)),
    );
    report.concurrent = concurrent.map((r) => ({
      outcome: r.outcome,
      reason: r.reason,
      rewardId: r.rewardId,
      terminal: r.terminal,
    }));
    const rewardCount = await countEq(
      sb,
      'creator_rewards',
      'ledger_entry_id',
      chain.ledgerEntryId,
    );
    const settlementCount = await countEq(
      sb,
      'ledger_settlements',
      'ledger_entry_id',
      chain.ledgerEntryId,
    );
    report.concurrentCounts = { rewardCount, settlementCount };
    if (rewardCount !== 1 || settlementCount !== 1) {
      report.reason = 'concurrent_duplicated_reward';
      return;
    }
    if (
      !concurrent.every(
        (r) =>
          r.terminal &&
          (r.outcome === 'duplicate' || r.outcome === 'created') &&
          (r.rewardId === positive.rewardId || r.outcome === 'created'),
      )
    ) {
      report.reason = 'concurrent_non_convergent';
      return;
    }

    // ── FASE 6 RECONCILIATION (pending schedule, no process) ──
    const reconChain = await buildSettledLedger(sb, {
      offerId: fixtures.offerId,
      creatorId: fixtures.creatorId,
      clickerUserId: fixtures.clickerId,
      suffix: 'recon',
    });
    report.reconChain = {
      ok: reconChain.ok,
      reason: reconChain.reason ?? null,
      ledgerEntryId: reconChain.ledgerEntryId ?? null,
    };
    if (!reconChain.ok || !reconChain.ledgerEntryId) {
      report.reason = reconChain.reason ?? 'recon_chain_failed';
      return;
    }

    await scheduleLedgerRewardAttempt(sb, {
      ledgerEntryId: reconChain.ledgerEntryId,
      commissionId: reconChain.commissionId ?? null,
    });
    // Leave as pending — do not process. Safety net must recover.
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';

    const recon = await reconcileLedgerRewardBridge(sb, {
      limit: 20,
      lookbackHours: 2,
    });
    report.reconcile = {
      scanned: recon.scanned,
      attempted: recon.attempted,
      created: recon.created,
      duplicate: recon.duplicate,
      results: recon.results
        .filter((r) => r.ledgerEntryId === reconChain.ledgerEntryId)
        .map((r) => ({
          outcome: r.outcome,
          reason: r.reason,
          rewardId: r.rewardId,
        })),
    };

    const reconRewardCount = await countEq(
      sb,
      'creator_rewards',
      'ledger_entry_id',
      reconChain.ledgerEntryId,
    );
    const reconSettlementCount = await countEq(
      sb,
      'ledger_settlements',
      'ledger_entry_id',
      reconChain.ledgerEntryId,
    );
    report.reconCounts = { reconRewardCount, reconSettlementCount };
    if (reconRewardCount !== 1 || reconSettlementCount !== 1) {
      report.reason = `reconcile_reward_count:${reconRewardCount}:${reconSettlementCount}`;
      return;
    }

    // ── FASE 7 TERMINAL REJECTION ──
    // A) anonymous click
    const anonChain = await buildSettledLedger(sb, {
      offerId: fixtures.offerId,
      creatorId: fixtures.creatorId,
      clickerUserId: null,
      suffix: 'anon',
    });
    report.anonChain = {
      ok: anonChain.ok,
      reason: anonChain.reason ?? null,
      ledgerEntryId: anonChain.ledgerEntryId ?? null,
    };
    if (!anonChain.ok || !anonChain.ledgerEntryId) {
      report.reason = anonChain.reason ?? 'anon_chain_failed';
      return;
    }
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    await scheduleLedgerRewardAttempt(sb, {
      ledgerEntryId: anonChain.ledgerEntryId,
      commissionId: anonChain.commissionId ?? null,
    });
    const anonAttempt = await processLedgerRewardAttempt(sb, anonChain.ledgerEntryId);
    report.terminalAnonymous = anonAttempt;
    if (
      anonAttempt.outcome !== 'rejected' ||
      anonAttempt.reason !== 'anonymous_click_not_auto_rewardable' ||
      !anonAttempt.terminal
    ) {
      report.reason = `anon_terminal_failed:${anonAttempt.outcome}:${anonAttempt.reason}`;
      return;
    }
    const anonRewards = await countEq(
      sb,
      'creator_rewards',
      'ledger_entry_id',
      anonChain.ledgerEntryId,
    );
    if (anonRewards !== 0) {
      report.reason = 'anon_created_reward';
      return;
    }

    // Reconcile must not retry terminal
    const reconAfterAnon = await reconcileLedgerRewardBridge(sb, {
      limit: 20,
      lookbackHours: 2,
    });
    const anonRetried = reconAfterAnon.results.some(
      (r) => r.ledgerEntryId === anonChain.ledgerEntryId,
    );
    report.anonReconcileRetried = anonRetried;
    if (anonRetried) {
      report.reason = 'anon_reconcile_retried_terminal';
      return;
    }

    // B) offer not participating — pre-unlock dated offer
    const { data: profile } = await sb
      .from('profiles')
      .select('reward_program_unlocked_at')
      .eq('id', fixtures.creatorId)
      .maybeSingle();
    const unlockedAt = (profile as { reward_program_unlocked_at?: string } | null)
      ?.reward_program_unlocked_at;
    if (!unlockedAt) {
      report.reason = 'missing_unlock_for_non_participating';
      return;
    }
    const preUnlockCreated = new Date(Date.parse(unlockedAt) - 86_400_000).toISOString();
    const { data: nonPartOffer, error: npErr } = await sb
      .from('offers')
      .insert({
        title: `[M5.2 ${STAMP}] non-participating`,
        price: 199,
        image_url: 'https://example.com/m52-np.jpg',
        store: 'Amazon',
        offer_url: `https://www.amazon.com.mx/dp/B0M52NP${STAMP.slice(-5)}`,
        status: 'approved',
        created_by: fixtures.creatorId,
        category: 'general',
        created_at: preUnlockCreated,
      })
      .select('id')
      .maybeSingle();
    if (npErr || !nonPartOffer?.id) {
      report.reason = `non_participating_offer_insert:${npErr?.message ?? 'null'}`;
      return;
    }
    const npParticipating = await isOfferParticipatingInRewards(sb, nonPartOffer.id);
    report.nonParticipatingOffer = {
      offerId: nonPartOffer.id,
      participating: npParticipating,
    };
    if (npParticipating) {
      report.reason = 'expected_non_participating_offer';
      return;
    }

    const npChain = await buildSettledLedger(sb, {
      offerId: nonPartOffer.id,
      creatorId: fixtures.creatorId,
      clickerUserId: fixtures.clickerId,
      suffix: 'np',
    });
    report.npChain = {
      ok: npChain.ok,
      reason: npChain.reason ?? null,
      ledgerEntryId: npChain.ledgerEntryId ?? null,
    };
    if (!npChain.ok || !npChain.ledgerEntryId) {
      report.reason = npChain.reason ?? 'np_chain_failed';
      return;
    }
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    await scheduleLedgerRewardAttempt(sb, {
      ledgerEntryId: npChain.ledgerEntryId,
      commissionId: npChain.commissionId ?? null,
    });
    const npAttempt = await processLedgerRewardAttempt(sb, npChain.ledgerEntryId);
    report.terminalNonParticipating = npAttempt;
    if (
      npAttempt.outcome !== 'rejected' ||
      npAttempt.reason !== 'offer_not_participating' ||
      !npAttempt.terminal
    ) {
      report.reason = `np_terminal_failed:${npAttempt.outcome}:${npAttempt.reason}`;
      return;
    }
    const npRewards = await countEq(
      sb,
      'creator_rewards',
      'ledger_entry_id',
      npChain.ledgerEntryId,
    );
    if (npRewards !== 0) {
      report.reason = 'np_created_reward';
      return;
    }

    const reconAfterNp = await reconcileLedgerRewardBridge(sb, {
      limit: 20,
      lookbackHours: 2,
    });
    if (reconAfterNp.results.some((r) => r.ledgerEntryId === npChain.ledgerEntryId)) {
      report.reason = 'np_reconcile_retried_terminal';
      return;
    }

    // ── FASE 8 FLAGS + SAFETY ──
    failClosedFlags();
    report.flagsAfter = restoreWave3FailClosedFlags();

    const countsAfter = {
      creator_rewards: await headCount(sb, 'creator_rewards'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
      payout_intents: await headCount(sb, 'payout_intents'),
      ledger_settlements: await headCount(sb, 'ledger_settlements'),
    };
    report.countsAfter = countsAfter;
    report.payoutIntact =
      countsBefore.reward_payouts === countsAfter.reward_payouts &&
      countsBefore.payout_intents === countsAfter.payout_intents;

    if (!report.payoutIntact) {
      report.reason = 'payout_tables_changed';
      return;
    }

    if (prodBefore && prodKey) {
      const prod = client(prodUrl, prodKey);
      const prodAfter = {
        creator_rewards: await headCount(prod, 'creator_rewards'),
        reward_payouts: await headCount(prod, 'reward_payouts'),
        payout_intents: await headCount(prod, 'payout_intents'),
      };
      report.prodAfter = prodAfter;
      report.prodIntact =
        prodBefore.creator_rewards === prodAfter.creator_rewards &&
        prodBefore.reward_payouts === prodAfter.reward_payouts &&
        prodBefore.payout_intents === prodAfter.payout_intents;
      if (!report.prodIntact) {
        report.reason = 'production_counts_changed';
        return;
      }
    } else {
      report.prodIntact = 'skipped_no_prod_key';
    }

    const deltaRewards =
      (countsAfter.creator_rewards ?? 0) - (countsBefore.creator_rewards ?? 0);
    // positive + reconcile = 2 rewards; terminals = 0
    report.rewardDelta = deltaRewards;
    if (deltaRewards !== 2) {
      report.reason = `unexpected_reward_delta:${deltaRewards}`;
      return;
    }

    report.evidence = {
      settlementToLedger: chain.ledgerEntryId,
      bridgeAttempt: positive,
      creatorReward: positive.rewardId,
      reconcileRewardLedger: reconChain.ledgerEntryId,
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
