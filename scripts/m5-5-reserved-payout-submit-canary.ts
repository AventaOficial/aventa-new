/**
 * M5.5 — Staging canary: RESERVED → provider submit (stop before PAID).
 * Never provider real money. Never auto-PAID. Never reward_payouts authority.
 *
 *   npx tsx scripts/m5-5-reserved-payout-submit-canary.ts
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
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_CREATOR_SHARE_BPS,
  splitCommissionCents,
} from '@/lib/rewards/config';
import {
  scheduleLedgerRewardAttempt,
  processLedgerRewardAttempt,
} from '@/lib/rewards/ledgerRewardBridge';
import { processExpiredRewardHolds } from '@/lib/rewards/rewardsEngine';
import { processAvailableRewardPayoutIntent } from '@/lib/rewards/availablePayoutIntent';
import {
  processReservedPayoutSubmit,
  processUnknownPayoutReconcile,
} from '@/lib/rewards/reservedPayoutSubmit';
import {
  applyProviderConfirmation,
  cancelPayoutIntent,
  createSandboxPayoutProvider,
  loadPayoutIntent,
  resolvePayoutProvider,
  type PayoutProvider,
} from '@/lib/rewards/payoutIntent';

const STAMP = String(Date.now());
const TAG = `m55_${STAMP}`;
const OUT = join(process.cwd(), 'scripts', '_m55_reports');
const GROSS_ELIGIBLE = Math.ceil(
  (REWARDS_MIN_PAYOUT_CENTS * 10_000) / REWARDS_CREATOR_SHARE_BPS,
);

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

function countingProvider(
  options: Parameters<typeof createSandboxPayoutProvider>[0] = {},
): { provider: PayoutProvider; submitCalls: () => number } {
  const inner = createSandboxPayoutProvider(options);
  let n = 0;
  return {
    provider: {
      id: inner.id,
      async submit(intent) {
        n += 1;
        return inner.submit(intent);
      },
      async reconcile(intent) {
        return inner.reconcile(intent);
      },
    },
    submitCalls: () => n,
  };
}

async function headCount(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function rewardStatus(sb: SupabaseClient, rewardId: string) {
  const { data } = await sb
    .from('creator_rewards')
    .select('id, status')
    .eq('id', rewardId)
    .maybeSingle();
  return (data as { status?: string } | null)?.status ?? null;
}

async function ensureParticipatingOffer(sb: SupabaseClient) {
  const { data: unlocked } = await sb
    .from('profiles')
    .select('id, reward_program_unlocked_at')
    .not('reward_program_unlocked_at', 'is', null)
    .limit(20);
  for (const p of unlocked ?? []) {
    const creatorId = (p as { id: string }).id;
    const unlockedAt = (p as { reward_program_unlocked_at: string })
      .reward_program_unlocked_at;
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
    const createdAt = new Date(
      Math.max(Date.parse(unlockedAt) + 60_000, Date.now()),
    ).toISOString();
    const { data: inserted } = await sb
      .from('offers')
      .insert({
        title: `[M5.5 ${STAMP}] reserved→submit canary`,
        price: 499,
        image_url: 'https://example.com/m55.jpg',
        store: 'Amazon',
        offer_url: `https://www.amazon.com.mx/dp/B0M55${STAMP.slice(-6)}`,
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

async function createAvailableWithIntent(
  sb: SupabaseClient,
  fixtures: { offerId: string; creatorId: string; clickerId: string },
  suffix: string,
): Promise<{ ok: boolean; reason?: string; rewardId?: string; intentId?: string }> {
  const click = await recordAttributedClick(sb, {
    offerId: fixtures.offerId,
    clickerUserId: fixtures.clickerId,
    ip: `m55-${suffix}-${STAMP}`,
  });
  if (!click?.clickId) return { ok: false, reason: 'click_failed' };

  const subId = encodeAventaSubId(fixtures.offerId, click.clickId);
  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m55-conv-${suffix}-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: fixtures.offerId,
    rawReference: { m55: true, ascsubtag: subId },
    actor: 'm5_5_canary',
  });
  if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
    return { ok: false, reason: 'conversion_not_attributed' };
  }

  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m55-comm-${suffix}-${STAMP}`,
    grossCommissionCents: GROSS_ELIGIBLE,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    actor: 'm5_5_canary',
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
    actor: 'm5_5_canary',
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

  const past = new Date(Date.now() - 86_400_000).toISOString();
  await sb
    .from('creator_rewards')
    .update({ hold_until: past, updated_at: new Date().toISOString() })
    .eq('id', attempt.rewardId)
    .eq('status', 'VALIDATING');
  await processExpiredRewardHolds(sb, { limit: 50 });

  const reserved = await processAvailableRewardPayoutIntent(sb, attempt.rewardId);
  if (!reserved.intentId || reserved.intentStatus !== 'RESERVED') {
    return {
      ok: false,
      reason: `reserve:${reserved.outcome}:${reserved.intentStatus}`,
      rewardId: attempt.rewardId,
    };
  }
  return { ok: true, rewardId: attempt.rewardId, intentId: reserved.intentId };
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  failClosedFlags();

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm5-5-reserved-payout-submit-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.5_reserved_payout_submit',
    tag: TAG,
    realMoney: false,
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

    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.MONEY_PATH_FROZEN = 'false';
    process.env.PAYOUT_PROVIDER = 'sandbox';

    // A — RESERVED → submit initiated → NOT PAID
    const seedA = await createAvailableWithIntent(sb, fixtures, 'a');
    report.caseA_seed = seedA;
    if (!seedA.ok || !seedA.intentId || !seedA.rewardId) {
      report.reason = `caseA_seed:${seedA.reason}`;
      return;
    }
    const { provider: pA, submitCalls: callsA } = countingProvider({
      submit: 'initiated',
      providerReference: `sandbox:m55-a:${seedA.intentId}`,
    });
    const a = await processReservedPayoutSubmit(sb, seedA.intentId, { provider: pA });
    report.caseA = { ...a, submitCalls: callsA() };
    if (
      a.outcome !== 'submitted' ||
      a.intentStatus !== 'SUBMITTED' ||
      a.paid ||
      callsA() !== 1 ||
      (await rewardStatus(sb, seedA.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = `caseA_failed:${a.outcome}:${a.intentStatus}:calls=${callsA()}`;
      return;
    }

    // B — replay
    const b = await processReservedPayoutSubmit(sb, seedA.intentId, { provider: pA });
    report.caseB = { ...b, submitCalls: callsA() };
    if (b.outcome !== 'reused' || callsA() !== 1) {
      report.reason = `caseB_failed:${b.outcome}:calls=${callsA()}`;
      return;
    }

    // C — concurrent ×10 on fresh RESERVED
    const seedC = await createAvailableWithIntent(sb, fixtures, 'c');
    report.caseC_seed = seedC;
    if (!seedC.ok || !seedC.intentId || !seedC.rewardId) {
      report.reason = `caseC_seed:${seedC.reason}`;
      return;
    }
    const { provider: pC, submitCalls: callsC } = countingProvider({
      submit: 'initiated',
      providerReference: `sandbox:m55-c:${seedC.intentId}`,
    });
    const cResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        processReservedPayoutSubmit(sb, seedC.intentId!, { provider: pC }),
      ),
    );
    const cInvoked = cResults.filter((r) => r.providerSubmitInvoked).length;
    report.caseC = {
      submitCalls: callsC(),
      invoked: cInvoked,
      outcomes: cResults.map((r) => r.outcome),
      intentStatuses: [...new Set(cResults.map((r) => r.intentStatus))],
    };
    if (callsC() !== 1 || cInvoked !== 1) {
      report.reason = `caseC_failed:calls=${callsC()}:invoked=${cInvoked}`;
      return;
    }
    if ((await rewardStatus(sb, seedC.rewardId)) !== 'AVAILABLE') {
      report.reason = 'caseC_paid_leak';
      return;
    }

    // D — timeout → UNKNOWN
    const seedD = await createAvailableWithIntent(sb, fixtures, 'd');
    if (!seedD.ok || !seedD.intentId || !seedD.rewardId) {
      report.reason = `caseD_seed:${seedD.reason}`;
      return;
    }
    const d = await processReservedPayoutSubmit(sb, seedD.intentId, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    report.caseD = d;
    if (d.outcome !== 'unknown' || d.intentStatus !== 'UNKNOWN' || d.paid) {
      report.reason = `caseD_failed:${d.outcome}:${d.intentStatus}`;
      return;
    }

    // E — UNKNOWN replay submit → rejected
    const { provider: pE, submitCalls: callsE } = countingProvider({ submit: 'initiated' });
    const e = await processReservedPayoutSubmit(sb, seedD.intentId, { provider: pE });
    report.caseE = { ...e, submitCalls: callsE() };
    if (e.reason !== 'use_reconcile_for_unknown' || callsE() !== 0) {
      report.reason = `caseE_failed:${e.reason}:calls=${callsE()}`;
      return;
    }

    // F — UNKNOWN → reconcile SUCCESS evidence, stop before PAID
    const f = await processUnknownPayoutReconcile(sb, seedD.intentId, {
      sandboxOptions: {
        reconcile: 'success',
        providerReference: `sandbox:m55-f:${seedD.intentId}`,
      },
      applyPaid: false,
    });
    report.caseF = f;
    if (
      f.outcome !== 'evidence_observed' ||
      !f.confirmationPending ||
      f.paid ||
      f.intentStatus !== 'UNKNOWN' ||
      (await rewardStatus(sb, seedD.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = `caseF_failed:${f.outcome}:${f.intentStatus}`;
      return;
    }

    // G — UNKNOWN → reconcile FAILURE (fresh)
    const seedG = await createAvailableWithIntent(sb, fixtures, 'g');
    if (!seedG.ok || !seedG.intentId || !seedG.rewardId) {
      report.reason = `caseG_seed:${seedG.reason}`;
      return;
    }
    await processReservedPayoutSubmit(sb, seedG.intentId, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    const g = await processUnknownPayoutReconcile(sb, seedG.intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'failure' }),
      sandboxOptions: { reconcile: 'failure' },
      applyPaid: false,
    });
    report.caseG = g;
    if (
      g.outcome !== 'reconciled_failed' ||
      g.intentStatus !== 'FAILED' ||
      g.paid ||
      (await rewardStatus(sb, seedG.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = `caseG_failed:${g.outcome}:${g.intentStatus}`;
      return;
    }

    // H/I/J — confirmation mismatches on initiated intent
    const seedH = await createAvailableWithIntent(sb, fixtures, 'h');
    if (!seedH.ok || !seedH.intentId || !seedH.rewardId) {
      report.reason = `caseH_seed:${seedH.reason}`;
      return;
    }
    const hSubmit = await processReservedPayoutSubmit(sb, seedH.intentId, {
      provider: createSandboxPayoutProvider({
        submit: 'initiated',
        providerReference: `sandbox:m55-h:${seedH.intentId}`,
      }),
    });
    const intentH = await loadPayoutIntent(sb, seedH.intentId);
    if (!intentH || hSubmit.intentStatus !== 'SUBMITTED') {
      report.reason = 'caseH_submit_failed';
      return;
    }
    const baseEv = {
      intentId: intentH.id,
      rewardId: seedH.rewardId,
      amountCents: intentH.amount_cents,
      currency: intentH.currency,
      idempotencyKey: intentH.idempotency_key,
      provider: intentH.provider,
      providerReference: String(intentH.meta.provider_reference ?? ''),
      outcome: 'confirmed_success' as const,
    };
    const hAmt = await applyProviderConfirmation(sb, {
      ...baseEv,
      amountCents: intentH.amount_cents + 1,
    });
    const hCur = await applyProviderConfirmation(sb, { ...baseEv, currency: 'USD' });
    const hKey = await applyProviderConfirmation(sb, {
      ...baseEv,
      idempotencyKey: 'payout_intent:mismatch:v1',
    });
    report.caseHIJ = {
      amountOk: hAmt.ok,
      currencyOk: hCur.ok,
      keyOk: hKey.ok,
      reward: await rewardStatus(sb, seedH.rewardId),
    };
    if (hAmt.ok || hCur.ok || hKey.ok) {
      report.reason = 'caseHIJ_should_reject';
      return;
    }

    // K — CANCELLED → no submit
    const seedK = await createAvailableWithIntent(sb, fixtures, 'k');
    if (!seedK.ok || !seedK.intentId) {
      report.reason = `caseK_seed:${seedK.reason}`;
      return;
    }
    await cancelPayoutIntent(sb, { intentId: seedK.intentId });
    const { provider: pK, submitCalls: callsK } = countingProvider({ submit: 'initiated' });
    const k = await processReservedPayoutSubmit(sb, seedK.intentId, { provider: pK });
    report.caseK = { ...k, submitCalls: callsK() };
    if (k.reason !== 'already_terminal' || callsK() !== 0) {
      report.reason = `caseK_failed:${k.reason}`;
      return;
    }

    // L — MONEY_PATH_FROZEN
    const seedL = await createAvailableWithIntent(sb, fixtures, 'l');
    if (!seedL.ok || !seedL.intentId) {
      report.reason = `caseL_seed:${seedL.reason}`;
      return;
    }
    process.env.MONEY_PATH_FROZEN = 'true';
    const l = await processReservedPayoutSubmit(sb, seedL.intentId, {
      provider: createSandboxPayoutProvider({ submit: 'initiated' }),
    });
    report.caseL = l;
    process.env.MONEY_PATH_FROZEN = 'false';
    if (l.reason !== 'money_path_frozen') {
      report.reason = `caseL_failed:${l.reason}`;
      return;
    }

    // M — real provider production blocked
    const m = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    report.caseM = m.ok ? { ok: true } : { ok: false, reason: m.reason };
    if (m.ok || (!m.ok && m.reason !== 'provider_forbidden_in_production')) {
      report.reason = 'caseM_failed';
      return;
    }

    const countsAfter = {
      payout_intents: await headCount(sb, 'payout_intents'),
      reward_payouts: await headCount(sb, 'reward_payouts'),
    };
    report.countsAfter = countsAfter;
    report.deltas = {
      payout_intents:
        countsBefore.payout_intents != null && countsAfter.payout_intents != null
          ? countsAfter.payout_intents - countsBefore.payout_intents
          : null,
      reward_payouts:
        countsBefore.reward_payouts != null && countsAfter.reward_payouts != null
          ? countsAfter.reward_payouts - countsBefore.reward_payouts
          : null,
    };

    // N — reward_payouts delta must be 0
    if (report.deltas && (report.deltas as { reward_payouts: number | null }).reward_payouts !== 0) {
      report.reason = `caseN_reward_payouts_delta:${(report.deltas as { reward_payouts: number }).reward_payouts}`;
      return;
    }

    // O — none of canary rewards PAID
    const rewardIds = [
      seedA.rewardId,
      seedC.rewardId,
      seedD.rewardId,
      seedG.rewardId,
      seedH.rewardId,
    ].filter(Boolean) as string[];
    const paidLeak: string[] = [];
    for (const id of rewardIds) {
      if ((await rewardStatus(sb, id)) === 'PAID') paidLeak.push(id);
    }
    report.caseO = { paidLeak };
    if (paidLeak.length) {
      report.reason = `caseO_paid_leak:${paidLeak.join(',')}`;
      return;
    }

    report.ok = true;
    report.summary = {
      submitCountCaseA: 1,
      submitCountCaseBReplay: 1,
      submitCountCaseCConcurrent: 1,
      unknownRejectsBlindSubmit: true,
      reconcileSuccessStopsBeforePaid: true,
      reconcileFailureNoPaid: true,
      rewardPayoutsDelta: 0,
      paidDelta: 0,
    };
  } catch (err) {
    report.reason = err instanceof Error ? err.message : String(err);
    report.stack = err instanceof Error ? err.stack : undefined;
  } finally {
    restoreWave3FailClosedFlags();
    failClosedFlags();
    report.flagsAfter = snapshotWave3Flags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`wrote ${outPath}`);
  }

  process.exit(report.ok ? 0 : 1);
}

main();
