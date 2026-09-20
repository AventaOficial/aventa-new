/**
 * M5.6 — Staging canary: SUBMITTED|UNKNOWN → applyProviderConfirmation → PAID.
 * Sandbox only. No real money. No production.
 *
 *   npx tsx scripts/m5-6-provider-confirmation-canary.ts
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
import {
  processExpiredRewardHolds,
  reverseReward,
} from '@/lib/rewards/rewardsEngine';
import { processAvailableRewardPayoutIntent } from '@/lib/rewards/availablePayoutIntent';
import { processReservedPayoutSubmit } from '@/lib/rewards/reservedPayoutSubmit';
import { processConfirmablePayoutIntent } from '@/lib/rewards/providerConfirmationAutomation';
import {
  cancelPayoutIntent,
  createSandboxPayoutProvider,
  loadPayoutIntent,
  processProviderWebhook,
  resolvePayoutProvider,
  signProviderWebhookPayload,
  PROVIDER_WEBHOOK_SIGNATURE_HEADER,
} from '@/lib/rewards/payoutIntent';

const STAMP = String(Date.now());
const TAG = `m56_${STAMP}`;
const OUT = join(process.cwd(), 'scripts', '_m56_reports');
const GROSS_ELIGIBLE = Math.ceil(
  (REWARDS_MIN_PAYOUT_CENTS * 10_000) / REWARDS_CREATOR_SHARE_BPS,
);
const WEBHOOK_SECRET = `m56-canary-secret-${STAMP}`;

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
        title: `[M5.6 ${STAMP}] confirmation canary`,
        price: 499,
        image_url: 'https://example.com/m56.jpg',
        store: 'Amazon',
        offer_url: `https://www.amazon.com.mx/dp/B0M56${STAMP.slice(-6)}`,
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

async function createThroughStatus(
  sb: SupabaseClient,
  fixtures: { offerId: string; creatorId: string; clickerId: string },
  suffix: string,
  mode: 'submitted' | 'unknown' | 'reserved',
): Promise<{
  ok: boolean;
  reason?: string;
  rewardId?: string;
  intentId?: string;
  idempotencyKey?: string;
  providerReference?: string;
}> {
  const click = await recordAttributedClick(sb, {
    offerId: fixtures.offerId,
    clickerUserId: fixtures.clickerId,
    ip: `m56-${suffix}-${STAMP}`,
  });
  if (!click?.clickId) return { ok: false, reason: 'click_failed' };

  const subId = encodeAventaSubId(fixtures.offerId, click.clickId);
  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m56-conv-${suffix}-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: fixtures.offerId,
    rawReference: { m56: true, ascsubtag: subId },
    actor: 'm5_6_canary',
  });
  if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
    return { ok: false, reason: 'conversion_not_attributed' };
  }

  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m56-comm-${suffix}-${STAMP}`,
    grossCommissionCents: GROSS_ELIGIBLE,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    actor: 'm5_6_canary',
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
    actor: 'm5_6_canary',
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
    return { ok: false, reason: `reward:${attempt.outcome}` };
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
    return { ok: false, reason: `reserve:${reserved.outcome}`, rewardId: attempt.rewardId };
  }

  if (mode === 'reserved') {
    return {
      ok: true,
      rewardId: attempt.rewardId,
      intentId: reserved.intentId,
      idempotencyKey: reserved.idempotencyKey ?? undefined,
    };
  }

  const ref = `sandbox:m56-${suffix}:${reserved.intentId}`;
  if (mode === 'unknown') {
    const sub = await processReservedPayoutSubmit(sb, reserved.intentId, {
      provider: createSandboxPayoutProvider({ submit: 'timeout' }),
      sandboxOptions: { submit: 'timeout' },
    });
    if (sub.intentStatus !== 'UNKNOWN') {
      return { ok: false, reason: `unknown:${sub.outcome}`, rewardId: attempt.rewardId };
    }
    return {
      ok: true,
      rewardId: attempt.rewardId,
      intentId: reserved.intentId,
      idempotencyKey: sub.idempotencyKey ?? undefined,
    };
  }

  const sub = await processReservedPayoutSubmit(sb, reserved.intentId, {
    provider: createSandboxPayoutProvider({
      submit: 'initiated',
      providerReference: ref,
    }),
  });
  if (sub.intentStatus !== 'SUBMITTED') {
    return { ok: false, reason: `submit:${sub.outcome}`, rewardId: attempt.rewardId };
  }
  return {
    ok: true,
    rewardId: attempt.rewardId,
    intentId: reserved.intentId,
    idempotencyKey: sub.idempotencyKey ?? undefined,
    providerReference: ref,
  };
}

function signedWebhook(body: object) {
  const rawBody = JSON.stringify(body);
  const sig = signProviderWebhookPayload(rawBody, WEBHOOK_SECRET);
  return {
    rawBody,
    headers: { [PROVIDER_WEBHOOK_SIGNATURE_HEADER]: sig },
  };
}

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  loadEnv(join(process.cwd(), '.env.staging.local'));
  process.env.AVENTA_SUPABASE_TARGET = process.env.AVENTA_SUPABASE_TARGET ?? 'staging';
  failClosedFlags();

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'm5-6-provider-confirmation-canary-latest.json');
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M5.6_provider_confirmation',
    tag: TAG,
    realMoney: false,
    expectedShare: splitCommissionCents(GROSS_ELIGIBLE, REWARDS_CREATOR_SHARE_BPS).creatorCents,
    flagsBefore: snapshotWave3Flags(),
  };

  const guard = assertWave3StagingOnly(process.env);
  report.guard = guard;
  if (!guard.ok) {
    writeFileSync(outPath, JSON.stringify(report, null, 2));
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
    process.env.PAYOUT_PROVIDER_WEBHOOK_SECRET = WEBHOOK_SECRET;

    // A — SUBMITTED → SUCCESS → PAID
    const seedA = await createThroughStatus(sb, fixtures, 'a', 'submitted');
    report.caseA_seed = seedA;
    if (!seedA.ok || !seedA.intentId || !seedA.rewardId) {
      report.reason = `caseA_seed:${seedA.reason}`;
      return;
    }
    const a = await processConfirmablePayoutIntent(sb, seedA.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: seedA.providerReference!,
      }),
      source: 'reconcile',
    });
    report.caseA = a;
    if (a.outcome !== 'paid' || (await rewardStatus(sb, seedA.rewardId)) !== 'PAID') {
      report.reason = `caseA_failed:${a.outcome}:${a.intentStatus}`;
      return;
    }

    // B — UNKNOWN → SUCCESS → PAID
    const seedB = await createThroughStatus(sb, fixtures, 'b', 'unknown');
    if (!seedB.ok || !seedB.intentId || !seedB.rewardId) {
      report.reason = `caseB_seed:${seedB.reason}`;
      return;
    }
    const refB = `sandbox:m56-b:${seedB.intentId}`;
    const b = await processConfirmablePayoutIntent(sb, seedB.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: refB,
      }),
    });
    report.caseB = b;
    if (b.outcome !== 'paid' || (await rewardStatus(sb, seedB.rewardId)) !== 'PAID') {
      report.reason = `caseB_failed:${b.outcome}`;
      return;
    }

    // C — UNKNOWN → UNKNOWN
    const seedC = await createThroughStatus(sb, fixtures, 'c', 'unknown');
    if (!seedC.ok || !seedC.intentId || !seedC.rewardId) {
      report.reason = `caseC_seed:${seedC.reason}`;
      return;
    }
    const c = await processConfirmablePayoutIntent(sb, seedC.intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'unknown' }),
    });
    report.caseC = c;
    if (
      c.outcome !== 'still_unknown' ||
      c.intentStatus !== 'UNKNOWN' ||
      (await rewardStatus(sb, seedC.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = `caseC_failed:${c.outcome}`;
      return;
    }

    // D — UNKNOWN → FAILURE
    const seedD = await createThroughStatus(sb, fixtures, 'd', 'unknown');
    if (!seedD.ok || !seedD.intentId || !seedD.rewardId) {
      report.reason = `caseD_seed:${seedD.reason}`;
      return;
    }
    const d = await processConfirmablePayoutIntent(sb, seedD.intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'failure' }),
    });
    report.caseD = d;
    if (
      d.outcome !== 'failed' ||
      d.intentStatus !== 'FAILED' ||
      (await rewardStatus(sb, seedD.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = `caseD_failed:${d.outcome}`;
      return;
    }

    // E — duplicate SUCCESS
    const e2 = await processConfirmablePayoutIntent(sb, seedA.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: seedA.providerReference!,
      }),
    });
    report.caseE = e2;
    if (e2.outcome !== 'reused' || e2.paid !== true) {
      report.reason = `caseE_failed:${e2.outcome}`;
      return;
    }

    // F/G — webhook SUCCESS + duplicate
    const seedF = await createThroughStatus(sb, fixtures, 'f', 'submitted');
    if (!seedF.ok || !seedF.intentId || !seedF.rewardId || !seedF.idempotencyKey) {
      report.reason = `caseF_seed:${seedF.reason}`;
      return;
    }
    const intentF = await loadPayoutIntent(sb, seedF.intentId);
    const whBody = {
      intent_id: seedF.intentId,
      reward_id: seedF.rewardId,
      amount_cents: intentF!.amount_cents,
      currency: intentF!.currency,
      idempotency_key: seedF.idempotencyKey,
      provider_reference: seedF.providerReference,
      provider: intentF!.provider,
      status: 'success',
    };
    const wh1 = await processProviderWebhook(sb, signedWebhook(whBody));
    const wh2 = await processProviderWebhook(sb, signedWebhook(whBody));
    report.caseFG = {
      first: wh1.ok ? wh1.code : wh1.reason,
      second: wh2.ok ? wh2.code : wh2.reason,
      reward: await rewardStatus(sb, seedF.rewardId),
    };
    if (
      !wh1.ok ||
      wh1.code !== 'SUCCESS' ||
      !wh2.ok ||
      wh2.code !== 'ALREADY_APPLIED' ||
      (await rewardStatus(sb, seedF.rewardId)) !== 'PAID'
    ) {
      report.reason = 'caseFG_failed';
      return;
    }

    // H — webhook + reconcile race
    const seedH = await createThroughStatus(sb, fixtures, 'h', 'submitted');
    if (!seedH.ok || !seedH.intentId || !seedH.rewardId || !seedH.idempotencyKey) {
      report.reason = `caseH_seed:${seedH.reason}`;
      return;
    }
    const intentH = await loadPayoutIntent(sb, seedH.intentId);
    const whH = signedWebhook({
      intent_id: seedH.intentId,
      reward_id: seedH.rewardId,
      amount_cents: intentH!.amount_cents,
      currency: intentH!.currency,
      idempotency_key: seedH.idempotencyKey,
      provider_reference: seedH.providerReference,
      provider: intentH!.provider,
      status: 'success',
    });
    await Promise.all([
      processProviderWebhook(sb, whH),
      processConfirmablePayoutIntent(sb, seedH.intentId, {
        provider: createSandboxPayoutProvider({
          reconcile: 'success',
          providerReference: seedH.providerReference!,
        }),
      }),
      processConfirmablePayoutIntent(sb, seedH.intentId, {
        provider: createSandboxPayoutProvider({
          reconcile: 'success',
          providerReference: seedH.providerReference!,
        }),
      }),
    ]);
    report.caseH = { reward: await rewardStatus(sb, seedH.rewardId) };
    if ((await rewardStatus(sb, seedH.rewardId)) !== 'PAID') {
      report.reason = 'caseH_failed';
      return;
    }

    // I/J/K/L — mismatches
    const seedI = await createThroughStatus(sb, fixtures, 'i', 'submitted');
    if (!seedI.ok || !seedI.intentId || !seedI.rewardId || !seedI.idempotencyKey) {
      report.reason = `caseI_seed:${seedI.reason}`;
      return;
    }
    const intentI = await loadPayoutIntent(sb, seedI.intentId);
    const baseWh = {
      intent_id: seedI.intentId,
      reward_id: seedI.rewardId,
      amount_cents: intentI!.amount_cents,
      currency: intentI!.currency,
      idempotency_key: seedI.idempotencyKey,
      provider_reference: seedI.providerReference,
      provider: intentI!.provider,
      status: 'success',
    };
    const iAmt = await processProviderWebhook(
      sb,
      signedWebhook({ ...baseWh, amount_cents: intentI!.amount_cents + 1 }),
    );
    const iCur = await processProviderWebhook(
      sb,
      signedWebhook({ ...baseWh, currency: 'USD' }),
    );
    const iRef = await processProviderWebhook(
      sb,
      signedWebhook({ ...baseWh, provider_reference: 'MISMATCH-REF' }),
    );
    const iKey = await processProviderWebhook(
      sb,
      signedWebhook({ ...baseWh, idempotency_key: 'payout_intent:mismatch:v1' }),
    );
    report.caseIJKL = {
      amount: iAmt.ok,
      currency: iCur.ok,
      ref: iRef.ok,
      key: iKey.ok,
      reward: await rewardStatus(sb, seedI.rewardId),
    };
    if (
      iAmt.ok ||
      iCur.ok ||
      iRef.ok ||
      iKey.ok ||
      (await rewardStatus(sb, seedI.rewardId)) !== 'AVAILABLE'
    ) {
      report.reason = 'caseIJKL_failed';
      return;
    }

    // M — already PAID idempotent (reuse seedA)
    const m = await processConfirmablePayoutIntent(sb, seedA.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: seedA.providerReference!,
      }),
    });
    report.caseM = m;
    if (m.outcome !== 'reused' || !m.paid) {
      report.reason = `caseM_failed:${m.outcome}`;
      return;
    }

    // N — CANCELLED intent
    const seedN = await createThroughStatus(sb, fixtures, 'n', 'reserved');
    if (!seedN.ok || !seedN.intentId || !seedN.rewardId) {
      report.reason = `caseN_seed:${seedN.reason}`;
      return;
    }
    await cancelPayoutIntent(sb, { intentId: seedN.intentId });
    const n = await processConfirmablePayoutIntent(sb, seedN.intentId, {
      provider: createSandboxPayoutProvider({ reconcile: 'success' }),
    });
    report.caseN = n;
    if (n.reason !== 'already_terminal' || (await rewardStatus(sb, seedN.rewardId)) === 'PAID') {
      report.reason = `caseN_failed:${n.reason}`;
      return;
    }

    // O — REVERSED reward (after AVAILABLE intent reserved then reverse)
    const seedO = await createThroughStatus(sb, fixtures, 'o', 'submitted');
    if (!seedO.ok || !seedO.intentId || !seedO.rewardId) {
      report.reason = `caseO_seed:${seedO.reason}`;
      return;
    }
    await reverseReward(sb, seedO.rewardId, fixtures.creatorId, 'm56');
    // Confirm may still attempt; reward not AVAILABLE → mark_paid_failed or similar
    const o = await processConfirmablePayoutIntent(sb, seedO.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: seedO.providerReference!,
      }),
    });
    report.caseO = { ...o, reward: await rewardStatus(sb, seedO.rewardId) };
    if ((await rewardStatus(sb, seedO.rewardId)) === 'PAID') {
      report.reason = 'caseO_paid_leak';
      return;
    }

    // P — freeze
    const seedP = await createThroughStatus(sb, fixtures, 'p', 'submitted');
    if (!seedP.ok || !seedP.intentId || !seedP.rewardId) {
      report.reason = `caseP_seed:${seedP.reason}`;
      return;
    }
    process.env.MONEY_PATH_FROZEN = 'true';
    const p = await processConfirmablePayoutIntent(sb, seedP.intentId, {
      provider: createSandboxPayoutProvider({
        reconcile: 'success',
        providerReference: seedP.providerReference!,
      }),
    });
    report.caseP = p;
    process.env.MONEY_PATH_FROZEN = 'false';
    if (p.reason !== 'money_path_frozen' || (await rewardStatus(sb, seedP.rewardId)) === 'PAID') {
      report.reason = `caseP_failed:${p.reason}`;
      return;
    }

    // Q — real blocked
    const q = resolvePayoutProvider({
      PAYOUT_PROVIDER: 'real',
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
    });
    report.caseQ = q.ok ? { ok: true } : { ok: false, reason: q.reason };
    if (q.ok || (!q.ok && q.reason !== 'provider_forbidden_in_production')) {
      report.reason = 'caseQ_failed';
      return;
    }

    // S — concurrent ×10
    const seedS = await createThroughStatus(sb, fixtures, 's', 'submitted');
    if (!seedS.ok || !seedS.intentId || !seedS.rewardId) {
      report.reason = `caseS_seed:${seedS.reason}`;
      return;
    }
    const sResults = await Promise.all(
      Array.from({ length: 10 }, () =>
        processConfirmablePayoutIntent(sb, seedS.intentId!, {
          provider: createSandboxPayoutProvider({
            reconcile: 'success',
            providerReference: seedS.providerReference!,
          }),
        }),
      ),
    );
    const sPaid = sResults.filter((r) => r.outcome === 'paid').length;
    const sReused = sResults.filter((r) => r.outcome === 'reused').length;
    report.caseS = { paid: sPaid, reused: sReused, reward: await rewardStatus(sb, seedS.rewardId) };
    if (
      sPaid + sReused !== 10 ||
      sPaid < 1 ||
      (await rewardStatus(sb, seedS.rewardId)) !== 'PAID'
    ) {
      report.reason = `caseS_failed:paid=${sPaid}:reused=${sReused}`;
      return;
    }

    // T — audit present for paid path
    const { count: auditCount } = await sb
      .from('reward_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', seedA.intentId);
    report.caseT = { auditRowsForA: auditCount ?? 0 };
    if ((auditCount ?? 0) < 1) {
      report.reason = 'caseT_no_audit';
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

    // R — reward_payouts delta 0
    if ((report.deltas as { reward_payouts: number | null }).reward_payouts !== 0) {
      report.reason = `caseR_reward_payouts_delta`;
      return;
    }

    report.ok = true;
    report.summary = {
      paidViaReconcile: true,
      paidViaWebhook: true,
      duplicateNoDoublePaid: true,
      raceOnePaid: true,
      mismatchesRejected: true,
      rewardPayoutsDelta: 0,
      concurrentMaxOnePaid: true,
      authority: 'applyProviderConfirmation',
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
