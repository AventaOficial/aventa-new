/**
 * M3.1 — Rewards staging canary (negative + attributable chain + reward).
 *
 *   npx tsx scripts/m3-1-rewards-staging-canary.ts
 *
 * Process-scoped flags only. No payouts. No cron. No production writes.
 * Does not invent attribution on M2 ledger. Does not modify rewards engine.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
import { tryCreateRewardFromLedgerRow, type LedgerRowForReward } from '@/lib/rewards/processLedger';
import { maybeUnlockRewardsProgram, selectWelcomeOffer } from '@/lib/rewards/unlock';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '@/lib/rewards/config';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';

console.error('[m3.1] module-loaded');

const M2_LEDGER_ID = '6537988e-5432-492d-9d99-7ade8119a9a4';
const STAMP = String(Date.now());
const ACTOR = 'm3_1_rewards_staging_canary';

function loadEnvFile(path: string) {
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
    const key = m[1].trim();
    if (process.env[key] == null) process.env[key] = v;
  }
}

async function headCount(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function moneySnapshot(sb: SupabaseClient) {
  return {
    creator_rewards: await headCount(sb, 'creator_rewards'),
    reward_payouts: await headCount(sb, 'reward_payouts'),
    ledger_settlements: await headCount(sb, 'ledger_settlements'),
    reward_audit_log: await headCount(sb, 'reward_audit_log'),
    affiliate_ledger_entries: await headCount(sb, 'affiliate_ledger_entries'),
    affiliate_commissions: await headCount(sb, 'affiliate_commissions'),
    affiliate_conversions: await headCount(sb, 'affiliate_conversions'),
    reward_outbound_clicks: await headCount(sb, 'reward_outbound_clicks'),
  };
}

async function loadLedgerRow(
  sb: SupabaseClient,
  id: string,
): Promise<LedgerRowForReward | null> {
  const { data, error } = await sb
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, status, external_ref, notes, meta, created_at, tracking_tag, offer_id, creator_id, click_id, attributable, attribution_method, attribution_confidence',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as LedgerRowForReward;
}

function clientFor(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function phaseANegative(sb: SupabaseClient) {
  const before = {
    cr: await headCount(sb, 'creator_rewards'),
    rp: await headCount(sb, 'reward_payouts'),
    ls: await headCount(sb, 'ledger_settlements'),
  };
  const row = await loadLedgerRow(sb, M2_LEDGER_ID);
  if (!row) {
    return { ok: false, reason: 'm2_ledger_missing', before };
  }

  // Process-scoped: unfreeze + rewards ON so we exercise attribution fail-closed (not freeze gate).
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  const result = await tryCreateRewardFromLedgerRow(sb, row);
  const after = {
    cr: await headCount(sb, 'creator_rewards'),
    rp: await headCount(sb, 'reward_payouts'),
    ls: await headCount(sb, 'ledger_settlements'),
  };
  const ledgerAfter = await loadLedgerRow(sb, M2_LEDGER_ID);

  const ok =
    result.created === false &&
    Boolean(result.reason) &&
    after.cr === before.cr &&
    after.rp === before.rp &&
    after.ls === before.ls &&
    (ledgerAfter as { creator_id?: string | null } | null)?.creator_id == null &&
    (ledgerAfter as { offer_id?: string | null } | null)?.offer_id == null &&
    (ledgerAfter as { click_id?: string | null } | null)?.click_id == null;

  return {
    ok,
    result,
    before,
    after,
    ledgerAttribution: {
      creator_id: (ledgerAfter as { creator_id?: string | null } | null)?.creator_id ?? null,
      offer_id: (ledgerAfter as { offer_id?: string | null } | null)?.offer_id ?? null,
      click_id: (ledgerAfter as { click_id?: string | null } | null)?.click_id ?? null,
      attributable: (ledgerAfter as { attributable?: boolean } | null)?.attributable ?? null,
      attribution_method:
        (ledgerAfter as { attribution_method?: string | null } | null)?.attribution_method ?? null,
    },
  };
}

async function ensureParticipatingOffer(
  sb: SupabaseClient,
): Promise<{
  ok: boolean;
  reason?: string;
  creatorId?: string;
  clickerId?: string;
  offerId?: string;
  asin?: string;
}> {
  // Prefer an existing unlocked creator with a post-unlock approved Amazon offer.
  const { data: unlocked } = await sb
    .from('profiles')
    .select('id, reward_program_unlocked_at, welcome_offer_id')
    .not('reward_program_unlocked_at', 'is', null)
    .limit(20);

  for (const p of unlocked ?? []) {
    const creatorId = (p as { id: string }).id;
    const unlockedAt = (p as { reward_program_unlocked_at: string }).reward_program_unlocked_at;
    const welcomeId = (p as { welcome_offer_id?: string | null }).welcome_offer_id ?? null;

    const { data: offers } = await sb
      .from('offers')
      .select('id, created_by, status, created_at, offer_url')
      .eq('created_by', creatorId)
      .in('status', ['approved', 'published'])
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(30);

    for (const o of offers ?? []) {
      const offer = o as {
        id: string;
        created_at: string;
        offer_url?: string;
        status: string;
      };
      const url = offer.offer_url ?? '';
      if (!/amazon\./i.test(url) && !/\/dp\//i.test(url)) continue;
      const participating = await isOfferParticipatingInRewards(sb, offer.id);
      if (!participating) continue;

      const { data: others } = await sb
        .from('profiles')
        .select('id')
        .neq('id', creatorId)
        .limit(5);
      const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
      if (!clickerId) continue;

      return {
        ok: true,
        creatorId,
        clickerId,
        offerId: offer.id,
        asin: url,
      };
    }

    // Build a post-unlock Amazon offer for this unlocked creator.
    const { data: others } = await sb
      .from('profiles')
      .select('id')
      .neq('id', creatorId)
      .limit(5);
    const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
    if (!clickerId) continue;

    const asin = `B0M31${STAMP.slice(-6)}`;
    const offerUrl = `https://www.amazon.com.mx/dp/${asin}`;
    const createdAt = new Date(
      Math.max(Date.parse(unlockedAt) + 60_000, Date.now()),
    ).toISOString();
    const { data: inserted, error } = await sb
      .from('offers')
      .insert({
        title: `[M3.1 ${STAMP}] Rewards canary Amazon`,
        price: 499,
        image_url: 'https://example.com/m31.jpg',
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
    const participating = await isOfferParticipatingInRewards(sb, inserted.id);
    if (!participating) {
      return { ok: false, reason: 'offer_not_participating_after_insert', offerId: inserted.id };
    }
    return {
      ok: true,
      creatorId,
      clickerId,
      offerId: inserted.id,
      asin: offerUrl,
    };
  }

  // No unlocked creator — bootstrap via unlock authorities (not attribution invent).
  // Staging may have almost no profiles; create dedicated canary users via Auth admin.
  const prevRewards = process.env.REWARDS_PROGRAM_ACTIVE;
  process.env.REWARDS_PROGRAM_ACTIVE = 'true';

  try {
    const needed = 17;
    const { data: existingProfiles } = await sb.from('profiles').select('id').limit(40);
    const ids: string[] = (existingProfiles ?? []).map((r) => (r as { id: string }).id);

    while (ids.length < needed) {
      const n = ids.length;
      const email = `m31-canary-${STAMP}-${n}@aventa-staging.test`;
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email,
        password: `M31Canary!${STAMP.slice(-8)}${n}`,
        email_confirm: true,
      });
      if (createErr || !created?.user?.id) {
        return {
          ok: false,
          reason: `auth_user_create_failed:${createErr?.message ?? 'null'}`,
        };
      }
      const uid = created.user.id;
      await sb.from('profiles').upsert({
        id: uid,
        username: `m31_${STAMP.slice(-6)}_${n}`,
      });
      ids.push(uid);
    }

    const creatorId = ids[0];
    const voters = ids.slice(1, 16);
    const clickerId = ids[16] ?? ids[1];

    // Satisfy REWARDS_MIN_ACCOUNT_AGE_DAYS without inventing attribution.
    const aged = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await sb.from('profiles').update({ created_at: aged }).eq('id', creatorId);

  // Seed 15 approved offers + votes if needed for unlock eligibility.
  const seedUrls = voters.map(
    (_, i) => `https://www.amazon.com.mx/dp/B0SEED${STAMP.slice(-4)}${i}`,
  );
  const { data: seeded, error: seedErr } = await sb
    .from('offers')
    .insert(
      seedUrls.map((offer_url, i) => ({
        title: `[M3.1 seed ${STAMP}] ${i + 1}`,
        price: 100 + i,
        image_url: 'https://example.com/seed.jpg',
        store: 'Amazon',
        offer_url,
        status: 'approved',
        created_by: creatorId,
        category: 'general',
      })),
    )
    .select('id');
  if (seedErr || !seeded?.length) {
    return { ok: false, reason: `seed_offers_failed:${seedErr?.message ?? 'null'}` };
  }
  for (let i = 0; i < Math.min(15, seeded.length); i++) {
    await sb.from('offer_votes').insert({
      offer_id: (seeded[i] as { id: string }).id,
      user_id: voters[i],
      value: 2,
    });
  }

  const unlock = await maybeUnlockRewardsProgram(sb, creatorId, voters[0]);
  if (!unlock.unlocked) {
    return {
      ok: false,
      reason: `unlock_failed:${unlock.blockedReason ?? JSON.stringify(unlock)}`,
    };
  }

  const welcomeOfferId = (seeded[0] as { id: string }).id;
  const sel = await selectWelcomeOffer(sb, creatorId, welcomeOfferId, {
    acceptTerms: true,
  });
  if (!sel.ok && (sel as { status?: number }).status !== 409) {
    // 409 = already selected — acceptable
    const status = (sel as { status?: number }).status;
    if (status !== 409) {
      return { ok: false, reason: `welcome_failed:${JSON.stringify(sel)}` };
    }
  }

  const asin = `B0M31${STAMP.slice(-6)}`;
  const offerUrl = `https://www.amazon.com.mx/dp/${asin}`;
  const { data: post, error: postErr } = await sb
    .from('offers')
    .insert({
      title: `[M3.1 ${STAMP}] Post-unlock canary`,
      price: 799,
      image_url: 'https://example.com/m31b.jpg',
      store: 'Amazon',
      offer_url: offerUrl,
      status: 'approved',
      created_by: creatorId,
      category: 'general',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();
  if (postErr || !post?.id) {
    return { ok: false, reason: `post_unlock_offer_failed:${postErr?.message ?? 'null'}` };
  }
  const participating = await isOfferParticipatingInRewards(sb, post.id);
  if (!participating) {
    return { ok: false, reason: 'post_unlock_not_participating', offerId: post.id };
  }
  return { ok: true, creatorId, clickerId, offerId: post.id, asin: offerUrl };
  } finally {
    if (prevRewards !== undefined) process.env.REWARDS_PROGRAM_ACTIVE = prevRewards;
    else process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  }
}

async function phaseBBuildChain(sb: SupabaseClient) {
  console.error('[m3.1] phase-b offer-start');
  const offerCtx = await ensureParticipatingOffer(sb);
  console.error('[m3.1] phase-b offer-done', offerCtx);
  if (!offerCtx.ok || !offerCtx.offerId || !offerCtx.creatorId || !offerCtx.clickerId) {
    return { ok: false as const, phase: 'offer', ...offerCtx };
  }

  // Settlement requires bridge ON + freeze OFF + rewards OFF + commission OFF.
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  const click = await recordAttributedClick(sb, {
    offerId: offerCtx.offerId,
    clickerUserId: offerCtx.clickerId,
    ip: `m31-${STAMP}`,
    userAgent: `m31-canary/${STAMP}`,
  });
  if (!click?.clickId) {
    return { ok: false as const, phase: 'click', offerCtx, reason: 'click_failed' };
  }

  const subId = encodeAventaSubId(offerCtx.offerId, click.clickId);

  const conv = await recordConversion(sb, {
    source: 'manual',
    network: 'amazon',
    externalConversionId: `m31-conv-${STAMP}`,
    occurredAt: new Date(),
    clickId: click.clickId,
    offerId: offerCtx.offerId,
    orderAmountCents: 49900,
    currency: 'MXN',
    rawReference: { m31: true, ascsubtag: subId },
    actor: ACTOR,
  });
  if (!conv?.conversionId) {
    return { ok: false as const, phase: 'conversion', offerCtx, click, reason: 'conversion_failed' };
  }

  const gross = 2500;
  const comm = await recordCommission(sb, {
    conversionId: conv.conversionId,
    source: 'manual',
    network: 'amazon',
    externalCommissionId: `m31-comm-${STAMP}`,
    grossCommissionCents: gross,
    currency: 'MXN',
    occurredAt: new Date(),
    status: 'pending',
    rawReference: { m31: true, ascsubtag: subId, click_id: click.clickId },
    actor: ACTOR,
  });
  if (!comm?.commissionId) {
    return { ok: false as const, phase: 'commission', offerCtx, click, conv, reason: 'commission_failed' };
  }

  await sb
    .from('affiliate_commissions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', comm.commissionId);

  const settled = await settleCommission(sb, {
    commissionId: comm.commissionId,
    actor: ACTOR,
  });
  if (!settled.ok || !settled.ledgerEntryId) {
    return {
      ok: false as const,
      phase: 'settlement',
      offerCtx,
      click,
      conv,
      comm,
      settled,
      reason: settled.reason ?? 'settle_failed',
    };
  }

  const ledger = await loadLedgerRow(sb, settled.ledgerEntryId);
  const { data: conversionRow } = await sb
    .from('affiliate_conversions')
    .select('id, click_id, offer_id, attribution_status')
    .eq('id', conv.conversionId)
    .maybeSingle();

  return {
    ok: true as const,
    offerCtx,
    click,
    subId,
    conv,
    comm: { ...comm, gross },
    settled,
    ledger,
    conversionRow,
    ledgerHasAttributionEvidence: Boolean(
      ledger?.click_id ||
        ledger?.offer_id ||
        ledger?.creator_id ||
        ledger?.tracking_tag ||
        (typeof ledger?.meta?.ascsubtag === 'string' && ledger.meta.ascsubtag) ||
        (typeof ledger?.meta?.sub_id === 'string' && ledger.meta.sub_id),
    ),
  };
}

async function phaseCReward(sb: SupabaseClient, ledgerId: string) {
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'true';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  const row = await loadLedgerRow(sb, ledgerId);
  if (!row) return { ok: false, reason: 'ledger_missing' };

  const before = {
    cr: await headCount(sb, 'creator_rewards'),
    rp: await headCount(sb, 'reward_payouts'),
    ls: await headCount(sb, 'ledger_settlements'),
  };

  const result = await tryCreateRewardFromLedgerRow(sb, row);
  const after = {
    cr: await headCount(sb, 'creator_rewards'),
    rp: await headCount(sb, 'reward_payouts'),
    ls: await headCount(sb, 'ledger_settlements'),
  };

  let reward: Record<string, unknown> | null = null;
  if (result.created && result.rewardId) {
    const { data } = await sb
      .from('creator_rewards')
      .select(
        'id, creator_id, offer_id, ledger_entry_id, gross_commission_cents, creator_share_cents, platform_share_cents, currency, status, hold_until, attribution_method, attribution_confidence, meta',
      )
      .eq('id', result.rewardId)
      .maybeSingle();
    reward = (data as Record<string, unknown> | null) ?? null;
  }

  const { count: lsForLedger } = await sb
    .from('ledger_settlements')
    .select('*', { count: 'exact', head: true })
    .eq('ledger_entry_id', ledgerId);

  return {
    ok: result.created === true,
    result,
    before,
    after,
    reward,
    ledgerSettlementsForLedger: lsForLedger ?? 0,
    expectedCreatorShare: splitCommissionCents(row.amount_cents, REWARDS_CREATOR_SHARE_BPS)
      .creatorCents,
  };
}

async function phaseDIdempotency(sb: SupabaseClient, ledgerId: string) {
  const row = await loadLedgerRow(sb, ledgerId);
  if (!row) return { ok: false, reason: 'ledger_missing' };
  const before = await headCount(sb, 'creator_rewards');
  const replay = await tryCreateRewardFromLedgerRow(sb, row);
  const after = await headCount(sb, 'creator_rewards');
  const { count: ls } = await sb
    .from('ledger_settlements')
    .select('*', { count: 'exact', head: true })
    .eq('ledger_entry_id', ledgerId);
  return {
    ok: replay.created === false && replay.reason === 'duplicate_ledger' && after === before,
    replay,
    before,
    after,
    ledgerSettlementsForLedger: ls ?? 0,
  };
}

async function phaseEConcurrency(sb: SupabaseClient, ledgerId: string) {
  const row = await loadLedgerRow(sb, ledgerId);
  if (!row) return { ok: false, reason: 'ledger_missing' };
  const before = await headCount(sb, 'creator_rewards');
  const results = await Promise.all([
    tryCreateRewardFromLedgerRow(sb, row),
    tryCreateRewardFromLedgerRow(sb, row),
    tryCreateRewardFromLedgerRow(sb, row),
  ]);
  const after = await headCount(sb, 'creator_rewards');
  const { count: ls } = await sb
    .from('ledger_settlements')
    .select('*', { count: 'exact', head: true })
    .eq('ledger_entry_id', ledgerId);
  const created = results.filter((r) => r.created).length;
  return {
    ok: created === 0 && after === before && (ls ?? 0) === 1,
    results,
    before,
    after,
    ledgerSettlementsForLedger: ls ?? 0,
    note: 'N=3 replay against already-rewarded ledger — expect all duplicate_ledger',
  };
}

async function main() {
  console.error('[m3.1] main-start');
  loadEnvFile(join(process.cwd(), '.env.local'));
  loadEnvFile(join(process.cwd(), '.env'));
  console.error('[m3.1] env-loaded', {
    target: process.env.AVENTA_SUPABASE_TARGET,
    ref: extractSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL),
  });

  // Fail-closed defaults until phases mutate process-scoped.
  process.env.MONEY_PATH_FROZEN = process.env.MONEY_PATH_FROZEN ?? 'true';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  const guard = assertWave3StagingOnly(process.env);
  console.error('[m3.1] guard', guard);
  if (!guard.ok) {
    const abort = { ok: false, phase: 'guard', reason: guard.reason };
    const outDir = join(process.cwd(), 'scripts', '_m31_reports');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'm3-1-rewards-staging-canary-latest.json'), JSON.stringify(abort, null, 2));
    console.error(JSON.stringify(abort, null, 2));
    process.exit(1);
  }

  const stagingUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const stagingKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  console.error('[m3.1] creds', { urlOk: stagingUrl.includes(STAGING_SUPABASE_REF), keyLen: stagingKey.length });
  if (!stagingUrl.includes(STAGING_SUPABASE_REF) || !stagingKey) {
    const abort = { ok: false, reason: 'staging_credentials_missing' };
    console.error(JSON.stringify(abort, null, 2));
    process.exit(1);
  }
  const sb = clientFor(stagingUrl, stagingKey);
  console.error('[m3.1] client-ready');

  const prodUrl =
    process.env.PRODUCTION_SUPABASE_URL ??
    process.env.AVENTA_PRODUCTION_SUPABASE_URL ??
    `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
  const prodKey =
    process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.AVENTA_PRODUCTION_SERVICE_ROLE_KEY ??
    '';
  console.error('[m3.1] prod-key', { present: Boolean(prodKey), prodRef: extractSupabaseProjectRef(prodUrl) });
  let prodBefore: Record<string, number | null> | null = null;
  let prodAfter: Record<string, number | null> | null = null;
  if (prodKey && extractSupabaseProjectRef(prodUrl) === PRODUCTION_SUPABASE_REF) {
    console.error('[m3.1] prod-snapshot-start');
    const prod = clientFor(prodUrl, prodKey);
    prodBefore = await moneySnapshot(prod);
    console.error('[m3.1] prod-snapshot-done', prodBefore);
  }

  console.error('[m3.1] staging-snapshot-start');
  const stagingBefore = await moneySnapshot(sb);
  console.error('[m3.1] staging-snapshot-done', stagingBefore);
  const flagsBefore = snapshotWave3Flags();
  console.error('[m3.1] flags', flagsBefore);

  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'M3.1',
    stagingRef: STAGING_SUPABASE_REF,
    flagsBefore,
    stagingBefore,
    prodBefore,
  };

  const outDir = join(process.cwd(), 'scripts', '_m31_reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'm3-1-rewards-staging-canary-latest.json');
  writeFileSync(outPath, JSON.stringify({ ...report, phase: 'pre_a' }, null, 2));
  console.error('[m3.1] pre-a checkpoint written');

  try {
    // —— FASE A ——
    console.error('[m3.1] phase-a-start');
    const negative = await phaseANegative(sb);
    console.error('[m3.1] phase-a-done', negative.result ?? negative);
    report.negativeControl = negative;
    restoreWave3FailClosedFlags();
    writeFileSync(outPath, JSON.stringify({ ...report, phase: 'post_a' }, null, 2));

    if (!negative.ok) {
      report.reason = 'negative_control_failed';
      return;
    }

    // —— FASE B ——
    const chain = await phaseBBuildChain(sb);
    report.realAttributableCanary = {
      ok: chain.ok,
      phase: 'phase' in chain ? chain.phase : 'complete',
      reason: 'reason' in chain ? chain.reason : undefined,
      offerId: chain.ok ? chain.offerCtx.offerId : (chain as { offerCtx?: { offerId?: string } }).offerCtx?.offerId,
      creatorId: chain.ok ? chain.offerCtx.creatorId : undefined,
      clickerId: chain.ok ? chain.offerCtx.clickerId : undefined,
      clickId: chain.ok ? chain.click.clickId : undefined,
      conversionId: chain.ok ? chain.conv.conversionId : undefined,
      attributionStatus: chain.ok ? chain.conv.attributionStatus : undefined,
      commissionId: chain.ok ? chain.comm.commissionId : undefined,
      ledgerEntryId: chain.ok ? chain.settled.ledgerEntryId : undefined,
      ledgerHasAttributionEvidence: chain.ok ? chain.ledgerHasAttributionEvidence : false,
      ledgerSnapshot: chain.ok
        ? {
            id: chain.ledger?.id,
            click_id: chain.ledger?.click_id ?? null,
            offer_id: chain.ledger?.offer_id ?? null,
            creator_id: chain.ledger?.creator_id ?? null,
            tracking_tag: chain.ledger?.tracking_tag ?? null,
            metaKeys: chain.ledger?.meta ? Object.keys(chain.ledger.meta) : [],
            amount_cents: chain.ledger?.amount_cents,
            status: chain.ledger?.status,
            network: chain.ledger?.network,
          }
        : null,
      conversionRow: chain.ok ? chain.conversionRow : null,
      subIdPresentOnClickPath: chain.ok ? Boolean(chain.subId) : false,
    };

    if (!chain.ok) {
      report.reason = `phase_b_failed:${(chain as { reason?: string }).reason ?? (chain as { phase?: string }).phase}`;
      return;
    }

    // —— FASE C —— (strict: only ledger row as processLedger would load it)
    const reward = await phaseCReward(sb, chain.settled.ledgerEntryId!);
    report.rewardResult = reward;

    if (!reward.ok) {
      report.reason = `phase_c_failed:${reward.result?.reason ?? reward.reason}`;
      report.blocker = {
        kind: 'settlement_ledger_missing_attribution_evidence',
        detail:
          'settleCommission writes ledger meta.settlement only; no click_id/offer_id/tracking_tag/ascsubtag. createRewardFromLedgerEntry → resolveCommissionAttribution returns no_evidence. Conversion row HAS click_id/offer_id but matcher does not join commission→conversion.',
        ledgerHasAttributionEvidence: chain.ledgerHasAttributionEvidence,
        conversionHasClick: Boolean(
          (chain.conversionRow as { click_id?: string } | null)?.click_id,
        ),
        expectedReason: 'no_evidence',
        actualReason: reward.result?.reason ?? reward.reason,
      };
      // Do not invent attribution to force PASS.
      return;
    }

    // —— FASE D ——
    const idem = await phaseDIdempotency(sb, chain.settled.ledgerEntryId!);
    report.idempotency = idem;

    // —— FASE E ——
    const conc = await phaseEConcurrency(sb, chain.settled.ledgerEntryId!);
    report.concurrency = conc;

    // —— FASE F ——
    const rp = await headCount(sb, 'reward_payouts');
    report.payoutBoundary = {
      ok: rp === stagingBefore.reward_payouts,
      reward_payouts: rp,
      baseline: stagingBefore.reward_payouts,
    };

    report.ok =
      Boolean(negative.ok) &&
      Boolean(chain.ok) &&
      Boolean(reward.ok) &&
      Boolean(idem.ok) &&
      Boolean(conc.ok) &&
      Boolean((report.payoutBoundary as { ok?: boolean }).ok);
  } finally {
    try {
      report.flagsAfter = restoreWave3FailClosedFlags();
      report.stagingAfter = await moneySnapshot(sb);
      if (prodKey && extractSupabaseProjectRef(prodUrl) === PRODUCTION_SUPABASE_REF) {
        const prod = clientFor(prodUrl, prodKey);
        prodAfter = await moneySnapshot(prod);
        report.prodAfter = prodAfter;
        report.prodUnchanged =
          prodBefore != null &&
          prodAfter != null &&
          Object.keys(prodBefore).every(
            (k) => (prodBefore as Record<string, number | null>)[k] === prodAfter![k],
          );
      } else {
        report.prodNote =
          'production service key unavailable — skipped live prod count (read-only intent preserved)';
      }
    } catch (e) {
      report.finallyError = e instanceof Error ? e.message : String(e);
      report.flagsAfter = restoreWave3FailClosedFlags();
    }
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(`[m3.1] wrote ${outPath}`);
  }

  console.error(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  restoreWave3FailClosedFlags();
  console.error('FATAL', err instanceof Error ? err.message : err);
  process.exit(1);
});
