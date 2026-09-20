/**
 * M3.1 — Reward canary on attributed ledger 20e5662d-… (staging only).
 *
 *   npx tsx scripts/m3-1-reward-canary-attributed.ts
 *
 * Process-scoped Rewards ON. Payouts never. No Reward Engine changes.
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
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import { tryCreateRewardFromLedgerRow, type LedgerRowForReward } from '@/lib/rewards/processLedger';
import { resolveCommissionAttribution } from '@/lib/rewards/attribution/matcher';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import type { AffiliateNetworkId } from '@/lib/rewards/adapters/types';

const TARGET_LEDGER = '20e5662d-a1a2-45d6-810a-55cd0aec6c3f';
const M2_LEDGER = '6537988e-5432-492d-9d99-7ade8119a9a4';
const OUT = join(process.cwd(), 'scripts', '_m31_reports');

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

async function headCount(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function loadLedger(sb: SupabaseClient, id: string) {
  const { data, error } = await sb
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, currency, status, external_ref, notes, meta, created_at, tracking_tag, offer_id, creator_id, click_id, attributable, attribution_method, attribution_confidence',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as (LedgerRowForReward & {
    currency?: string;
    attributable?: boolean;
    attribution_method?: string | null;
    attribution_confidence?: string | null;
  }) | null;
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  process.env.MONEY_PATH_FROZEN = process.env.MONEY_PATH_FROZEN ?? 'true';

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm3-1-reward-canary-attributed-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M3.1_reward_canary_attributed',
    targetLedger: TARGET_LEDGER,
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
    // —— FASE 1 PRECHECK ——
    const ledger = await loadLedger(sb, TARGET_LEDGER);
    if (!ledger) {
      report.reason = 'precheck_ledger_missing';
      return;
    }

    const { data: commission } = await sb
      .from('affiliate_commissions')
      .select('id, conversion_id, ledger_entry_id, status, gross_commission_cents, currency')
      .eq('ledger_entry_id', TARGET_LEDGER)
      .maybeSingle();

    const conversionId = (commission as { conversion_id?: string } | null)?.conversion_id;
    const { data: conversion } = conversionId
      ? await sb
          .from('affiliate_conversions')
          .select('id, click_id, offer_id, attribution_status')
          .eq('id', conversionId)
          .maybeSingle()
      : { data: null };

    const { data: click } = ledger.click_id
      ? await sb
          .from('reward_outbound_clicks')
          .select('id, offer_id, clicker_user_id')
          .eq('id', ledger.click_id)
          .maybeSingle()
      : { data: null };

    const { data: offer } = ledger.offer_id
      ? await sb
          .from('offers')
          .select('id, created_by, status')
          .eq('id', ledger.offer_id)
          .maybeSingle()
      : { data: null };

    const countsBefore = {
      creator_rewards: await headCount(sb, 'creator_rewards'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
      ledger_settlements: await headCount(sb, 'ledger_settlements'),
      reward_audit_log: await headCount(sb, 'reward_audit_log'),
    };

    let prodBefore: Record<string, number | null> | null = null;
    if (prodKey && extractSupabaseProjectRef(prodUrl) === PRODUCTION_SUPABASE_REF) {
      const prod = client(prodUrl, prodKey);
      prodBefore = {
        creator_rewards: await headCount(prod, 'creator_rewards'),
        reward_payouts: await headCount(prod, 'reward_payouts'),
        ledger_settlements: await headCount(prod, 'ledger_settlements'),
      };
    }

    const participating = ledger.offer_id
      ? await isOfferParticipatingInRewards(sb, ledger.offer_id)
      : false;

    const expectedShare = splitCommissionCents(
      Number(ledger.amount_cents),
      REWARDS_CREATOR_SHARE_BPS,
    ).creatorCents;

    const precheck = {
      ledgerExists: true,
      settlementLink:
        (commission as { ledger_entry_id?: string } | null)?.ledger_entry_id === TARGET_LEDGER,
      commissionId: (commission as { id?: string } | null)?.id ?? null,
      conversionAttributed:
        (conversion as { attribution_status?: string } | null)?.attribution_status ===
        'attributed',
      hasCreator: Boolean(ledger.creator_id),
      hasOffer: Boolean(ledger.offer_id),
      hasClick: Boolean(ledger.click_id),
      attributable: ledger.attributable === true,
      attributionMethod: ledger.attribution_method ?? null,
      attributionConfidence: ledger.attribution_confidence ?? null,
      clickMatchesOffer:
        (click as { offer_id?: string } | null)?.offer_id === ledger.offer_id,
      creatorMatchesOffer:
        (offer as { created_by?: string } | null)?.created_by === ledger.creator_id,
      offerParticipating: participating,
      clickerNotCreator:
        (click as { clicker_user_id?: string | null } | null)?.clicker_user_id != null &&
        (click as { clicker_user_id?: string | null }).clicker_user_id !== ledger.creator_id,
      amountCents: ledger.amount_cents,
      expectedCreatorShareCents: expectedShare,
      countsBefore,
      prodBefore,
    };

    report.precheck = precheck;

    const precheckOk =
      precheck.settlementLink &&
      precheck.conversionAttributed &&
      precheck.hasCreator &&
      precheck.hasOffer &&
      precheck.hasClick &&
      precheck.attributable &&
      Boolean(precheck.attributionMethod) &&
      Boolean(precheck.attributionConfidence) &&
      precheck.clickMatchesOffer &&
      precheck.creatorMatchesOffer &&
      precheck.offerParticipating &&
      precheck.clickerNotCreator;

    if (!precheckOk) {
      report.reason = 'precheck_failed';
      return;
    }

    // —— FASE 2 DRY RUN (resolver only, Rewards OFF, freeze true) ——
    process.env.REWARDS_PROGRAM_ACTIVE = 'false';
    process.env.MONEY_PATH_FROZEN = 'true';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';

    const dryAttr = await resolveCommissionAttribution(sb, {
      id: ledger.id,
      network: ledger.network as AffiliateNetworkId,
      amount_cents: Number(ledger.amount_cents),
      status: ledger.status,
      external_ref: ledger.external_ref,
      meta: ledger.meta as Record<string, unknown> | null,
      created_at: ledger.created_at,
      click_id: ledger.click_id,
      offer_id: ledger.offer_id,
      creator_id: ledger.creator_id,
      sub_id_raw: ledger.tracking_tag ?? null,
    });

    const dryRewardAttempt = await tryCreateRewardFromLedgerRow(sb, ledger);
    const countsAfterDry = {
      creator_rewards: await headCount(sb, 'creator_rewards'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
      ledger_settlements: await headCount(sb, 'ledger_settlements'),
    };

    report.dryRun = {
      attributionMatched: dryAttr.matched,
      attribution: dryAttr.matched
        ? {
            method: dryAttr.match.method,
            confidence: dryAttr.match.confidence,
            offerId: dryAttr.match.offerId,
            creatorId: dryAttr.match.creatorId,
            clickId: dryAttr.match.clickId,
          }
        : { reason: dryAttr.reason, confidence: dryAttr.confidence },
      rewardBlockedReason: dryRewardAttempt.created
        ? 'UNEXPECTED_WRITE'
        : dryRewardAttempt.reason,
      // freeze checked before program — expect money_path_frozen
      noWrites:
        countsAfterDry.creator_rewards === countsBefore.creator_rewards &&
        countsAfterDry.reward_payouts === countsBefore.reward_payouts &&
        countsAfterDry.ledger_settlements === countsBefore.ledger_settlements,
      eligibleIfUnfrozen:
        dryAttr.matched &&
        dryAttr.match.confidence === 'high' &&
        dryAttr.match.creatorId === ledger.creator_id &&
        dryAttr.match.offerId === ledger.offer_id,
    };

    if (
      !dryAttr.matched ||
      !(report.dryRun as { noWrites?: boolean }).noWrites ||
      !(report.dryRun as { eligibleIfUnfrozen?: boolean }).eligibleIfUnfrozen
    ) {
      report.reason = 'dry_run_failed';
      return;
    }

    // —— FASE 3 REWARD CANARY ——
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
    process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

    const created = await tryCreateRewardFromLedgerRow(sb, ledger);
    report.rewardCanary = { result: created };

    if (!created.created || !created.rewardId) {
      report.reason = `reward_create_failed:${created.reason}`;
      return;
    }

    const { data: reward } = await sb
      .from('creator_rewards')
      .select(
        'id, creator_id, offer_id, ledger_entry_id, gross_commission_cents, creator_share_cents, platform_share_cents, currency, status, hold_until, attribution_method, attribution_confidence, meta',
      )
      .eq('id', created.rewardId)
      .maybeSingle();

    const { count: lsForLedger } = await sb
      .from('ledger_settlements')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', TARGET_LEDGER);

    const { count: crForLedger } = await sb
      .from('creator_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', TARGET_LEDGER);

    const { count: auditCreated } = await sb
      .from('reward_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', created.rewardId)
      .eq('event_type', 'reward_created');

    const rpAfter = await headCount(sb, 'reward_payouts');

    report.rewardVerify = {
      reward,
      creatorRewardsForLedger: crForLedger ?? 0,
      ledgerSettlementsForLedger: lsForLedger ?? 0,
      auditRewardCreated: auditCreated ?? 0,
      payouts: rpAfter,
      amountOk:
        Number((reward as { creator_share_cents?: number } | null)?.creator_share_cents) ===
        expectedShare,
      currencyOk: (reward as { currency?: string } | null)?.currency === 'MXN',
      statusOk: (reward as { status?: string } | null)?.status === 'VALIDATING',
      idsOk:
        (reward as { ledger_entry_id?: string } | null)?.ledger_entry_id === TARGET_LEDGER &&
        (reward as { creator_id?: string } | null)?.creator_id === ledger.creator_id &&
        (reward as { offer_id?: string } | null)?.offer_id === ledger.offer_id,
    };

    const rewardOk =
      (crForLedger ?? 0) === 1 &&
      (lsForLedger ?? 0) === 1 &&
      (rpAfter ?? 0) === (countsBefore.reward_payouts ?? 0) &&
      (auditCreated ?? 0) >= 1 &&
      Boolean((report.rewardVerify as { amountOk?: boolean }).amountOk) &&
      Boolean((report.rewardVerify as { currencyOk?: boolean }).currencyOk) &&
      Boolean((report.rewardVerify as { statusOk?: boolean }).statusOk) &&
      Boolean((report.rewardVerify as { idsOk?: boolean }).idsOk);

    if (!rewardOk) {
      report.reason = 'reward_verify_failed';
      return;
    }

    // —— FASE 4 IDEMPOTENCY + CONCURRENCY ——
    const replay = await tryCreateRewardFromLedgerRow(sb, ledger);
    const concurrent = await Promise.all([
      tryCreateRewardFromLedgerRow(sb, ledger),
      tryCreateRewardFromLedgerRow(sb, ledger),
    ]);
    const { count: crAfterIdem } = await sb
      .from('creator_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', TARGET_LEDGER);
    const { count: lsAfterIdem } = await sb
      .from('ledger_settlements')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', TARGET_LEDGER);
    const rpAfterIdem = await headCount(sb, 'reward_payouts');

    report.idempotency = {
      replay,
      concurrent,
      creatorRewardsForLedger: crAfterIdem ?? 0,
      ledgerSettlementsForLedger: lsAfterIdem ?? 0,
      payouts: rpAfterIdem,
      ok:
        replay.created === false &&
        replay.reason === 'duplicate_ledger' &&
        concurrent.every((r) => r.created === false && r.reason === 'duplicate_ledger') &&
        (crAfterIdem ?? 0) === 1 &&
        (lsAfterIdem ?? 0) === 1 &&
        (rpAfterIdem ?? 0) === (countsBefore.reward_payouts ?? 0),
    };

    if (!(report.idempotency as { ok?: boolean }).ok) {
      report.reason = 'idempotency_failed';
      return;
    }

    // —— FASE 5 NEGATIVE CONTROLS ——
    const m2 = await loadLedger(sb, M2_LEDGER);
    const negA = m2
      ? await tryCreateRewardFromLedgerRow(sb, m2)
      : { created: false as const, reason: 'm2_missing' };

    // B: attributed=false input — engine may still resolve via click_id if present.
    // Use M2 (no click) as attributable=false stand-in for fail-closed path.
    const negB = m2
      ? await createRewardFromLedgerEntry(sb, {
          id: m2.id,
          network: m2.network as AffiliateNetworkId,
          amount_cents: Number(m2.amount_cents),
          status: m2.status,
          external_ref: m2.external_ref,
          click_id: null,
          offer_id: null,
          creator_id: null,
        })
      : { created: false as const, reason: 'm2_missing' };

    const negC = await createRewardFromLedgerEntry(sb, {
      id: '00000000-0000-4000-8000-0000000000c1',
      network: 'amazon',
      amount_cents: 1800,
      status: 'accrued',
      offer_id: ledger.offer_id!,
      creator_id: '00000000-0000-4000-8000-00000000dead',
      click_id: null,
    });

    const negD = await createRewardFromLedgerEntry(sb, {
      id: '00000000-0000-4000-8000-0000000000d1',
      network: 'amazon',
      amount_cents: 1800,
      status: 'accrued',
      click_id: '00000000-0000-4000-8000-00000000dead',
      offer_id: ledger.offer_id!,
      creator_id: ledger.creator_id!,
    });

    const negE = await createRewardFromLedgerEntry(sb, {
      id: '00000000-0000-4000-8000-00000000eeee',
      network: 'amazon',
      amount_cents: 1800,
      status: 'accrued',
      click_id: null,
      offer_id: null,
      creator_id: null,
    });

    const { count: crTotal } = await sb
      .from('creator_rewards')
      .select('*', { count: 'exact', head: true });
    const { count: crTarget } = await sb
      .from('creator_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('ledger_entry_id', TARGET_LEDGER);

    report.negatives = {
      A_m2: negA,
      B_unattributed: negB,
      C_creator_mismatch: negC,
      D_bad_click: negD,
      E_missing: negE,
      creatorRewardsTotal: crTotal ?? 0,
      creatorRewardsForTarget: crTarget ?? 0,
      ok:
        negA.created === false &&
        negB.created === false &&
        negC.created === false &&
        negD.created === false &&
        negE.created === false &&
        (crTarget ?? 0) === 1,
    };

    // —— FASE 6 PAYOUT BOUNDARY ——
    const rpFinal = await headCount(sb, 'reward_payouts');
    report.payoutBoundary = {
      creator_rewards: crTotal ?? 0,
      reward_payouts: rpFinal,
      ok: (crTarget ?? 0) === 1 && (rpFinal ?? 0) === (countsBefore.reward_payouts ?? 0),
    };

    report.ok =
      Boolean(rewardOk) &&
      Boolean((report.idempotency as { ok?: boolean }).ok) &&
      Boolean((report.negatives as { ok?: boolean }).ok) &&
      Boolean((report.payoutBoundary as { ok?: boolean }).ok);
  } finally {
    // —— FASE 7 POST-CANARY ——
    report.flagsAfter = restoreWave3FailClosedFlags();
    report.countsAfter = {
      creator_rewards: await headCount(sb, 'creator_rewards'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
      ledger_settlements: await headCount(sb, 'ledger_settlements'),
    };
    if (prodKey && extractSupabaseProjectRef(prodUrl) === PRODUCTION_SUPABASE_REF) {
      const prod = client(prodUrl, prodKey);
      report.prodAfter = {
        creator_rewards: await headCount(prod, 'creator_rewards'),
        reward_payouts: await headCount(prod, 'reward_payouts'),
        ledger_settlements: await headCount(prod, 'ledger_settlements'),
      };
    } else {
      report.prodNote = 'production service key unavailable — skipped live prod counts';
    }
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(`[m3.1-reward] wrote ${outPath}`);
    console.error(JSON.stringify(report, null, 2));
  }

  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  restoreWave3FailClosedFlags();
  console.error('FATAL', e instanceof Error ? e.message : e);
  process.exit(1);
});
