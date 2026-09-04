/**
 * QA manual staging — ejecutar SOLO contra mkgsrpsuvedwwlzmzmzh:
 *   STAGING_MANUAL_QA=1 npx vitest run tests/rewards/stagingManualQa.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  getRewardsProgress,
  getRewardsMembership,
} from '../../lib/rewards/eligibility';
import { maybeUnlockRewardsProgram, selectWelcomeOffer } from '../../lib/rewards/unlock';
import { resolveCommissionAttribution } from '../../lib/rewards/attribution/matcher';
import { encodeAventaSubId } from '../../lib/rewards/adapters/types';
import { recordOutboundClick, buildTrackedOfferUrl } from '../../lib/rewards/attribution/clickTracking';
import { tryCreateRewardFromLedgerRow } from '../../lib/rewards/processLedger';
import { processExpiredRewardHolds, reverseReward } from '../../lib/rewards/rewardsEngine';
import { createPaidRewardClawbackAdjustment } from '../../lib/rewards/clawback';
import { assignManualLedgerAttribution } from '../../lib/rewards/manualAttribution';
import { createManualRewardPayout } from '../../lib/rewards/payout';

const STAGING_REF = 'mkgsrpsuvedwwlzmzmzh';
const RUN_ID = `qa-${Date.now()}`;

function loadEnvLocal(): Record<string, string> {
  const raw = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const skip = !process.env.STAGING_MANUAL_QA;

describe.skipIf(skip)('Staging manual QA — mkgsrpsuvedwwlzmzmzh', () => {
  let supabase: SupabaseClient;
  let testUserId: string;
  let voterIds: string[] = [];
  let offerIds: string[] = [];
  let welcomeOfferId: string;
  let postUnlockOfferId: string;
  let clickId: string;
  let ledgerId: string;
  let rewardId: string;
  let actorId: string;

  beforeAll(async () => {
    const env = loadEnvLocal();
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    expect(url).toContain(STAGING_REF);

    supabase = createClient(url, key, { auth: { persistSession: false } });
    process.env.REWARDS_PROGRAM_ACTIVE = 'true';
    process.env.COMMISSION_PROGRAM_ACTIVE = 'false';

    const email = `qa-rewards-${RUN_ID}@aventa-staging.test`;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: `QaStaging!${RUN_ID.slice(-6)}`,
      email_confirm: true,
    });
    expect(createErr).toBeNull();
    testUserId = created!.user!.id;

    await supabase.from('profiles').upsert({ id: testUserId, username: `qa_${RUN_ID.slice(-8)}` });

    const { data: voters } = await supabase
      .from('profiles')
      .select('id')
      .neq('id', testUserId)
      .limit(20);
    voterIds = (voters ?? []).map((v) => (v as { id: string }).id).slice(0, 15);
    expect(voterIds.length).toBeGreaterThanOrEqual(15);

    actorId = voterIds[0];
  }, 120_000);

  afterAll(async () => {
    if (!testUserId) return;
    await supabase.auth.admin.deleteUser(testUserId).catch(() => {});
  });

  it('1) publica y aprueba 15 ofertas (staging)', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      title: `[QA ${RUN_ID}] Oferta ${i + 1}`,
      price: 100 + i,
      image_url: 'https://example.com/img.jpg',
      store: 'Amazon',
      offer_url: `https://www.amazon.com.mx/dp/QA${i}${RUN_ID.slice(-4)}`,
      status: 'approved',
      created_by: testUserId,
      category: 'general',
    }));
    const { data, error } = await supabase.from('offers').insert(rows).select('id');
    expect(error).toBeNull();
    offerIds = (data ?? []).map((r) => (r as { id: string }).id);
    expect(offerIds.length).toBe(15);
  });

  it('2) 15 votos positivos válidos (no auto-voto)', async () => {
    for (let i = 0; i < 15; i++) {
      const { error } = await supabase.from('offer_votes').insert({
        offer_id: offerIds[i],
        user_id: voterIds[i],
        value: 2,
      });
      expect(error).toBeNull();
    }
    const progress = await getRewardsProgress(supabase, testUserId);
    expect(progress.approvedOffersCount).toBeGreaterThanOrEqual(15);
    expect(progress.positiveVotesTotal).toBeGreaterThanOrEqual(15);
    expect(progress.unlockEligible).toBe(true);
  });

  it('3) desbloqueo Rewards + Welcome Offer inmutable', async () => {
    const unlock = await maybeUnlockRewardsProgram(supabase, testUserId, voterIds[0]);
    expect(unlock.unlocked).toBe(true);
    expect(unlock.unlockedAt).toBeTruthy();

    welcomeOfferId = offerIds[0];
    const sel = await selectWelcomeOffer(supabase, testUserId, welcomeOfferId, {
      acceptTerms: true,
    });
    expect(sel.ok).toBe(true);

    const second = await selectWelcomeOffer(supabase, testUserId, offerIds[1], {
      acceptTerms: true,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(409);

    const membership = await getRewardsMembership(supabase, testUserId);
    expect(membership.welcomeOfferId).toBe(welcomeOfferId);
    expect(membership.needsWelcomeSelection).toBe(false);
  });

  it('4) oferta post-unlock + click + ascsubtag HIGH', async () => {
    const unlockAt = new Date().toISOString();
    const amazonUrl = 'https://www.amazon.com.mx/dp/B0STAGINGQA1';

    const { data: postOffer, error } = await supabase
      .from('offers')
      .insert({
        title: `[QA ${RUN_ID}] Post-unlock Amazon`,
        price: 999,
        image_url: 'https://example.com/img2.jpg',
        store: 'Amazon',
        offer_url: amazonUrl,
        status: 'approved',
        created_by: testUserId,
        category: 'general',
        created_at: unlockAt,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    postUnlockOfferId = (postOffer as { id: string }).id;

    const click = await recordOutboundClick(supabase, {
      offerId: postUnlockOfferId,
      offerUrl: amazonUrl,
      clickerUserId: voterIds[1],
    });
    expect(click?.clickId).toBeTruthy();
    clickId = click!.clickId;

    const tracked = buildTrackedOfferUrl(amazonUrl, {
      offerId: postUnlockOfferId,
      clickId,
    });
    expect(tracked).toContain('ascsubtag=');
    expect(tracked).toContain(encodeAventaSubId(postUnlockOfferId, clickId).replace(/\./g, '.'));

    const subId = encodeAventaSubId(postUnlockOfferId, clickId);
    const attr = await resolveCommissionAttribution(supabase, {
      id: 'pending',
      network: 'amazon',
      amount_cents: 500_000,
      status: 'accrued',
      sub_id_raw: subId,
    });
    expect(attr.matched).toBe(true);
    if (attr.matched) {
      expect(attr.match.confidence).toBe('high');
      expect(attr.match.method).toBe('sub_id');
    }
  });

  it('5) flujo económico VALIDATING → AVAILABLE → payout → PAID', async () => {
    const subId = encodeAventaSubId(postUnlockOfferId, clickId);
    const extRef = `qa-ledger-${RUN_ID}`;

    const { data: ledger, error: ledgerErr } = await supabase
      .from('affiliate_ledger_entries')
      .insert({
        network: 'amazon',
        amount_cents: 500_000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: extRef,
        source: 'manual',
        meta: { ascsubtag: subId, staging_qa: RUN_ID },
      })
      .select('id, network, amount_cents, status, external_ref, notes, meta, created_at, tracking_tag')
      .single();
    expect(ledgerErr).toBeNull();
    ledgerId = (ledger as { id: string }).id;

    const created = await tryCreateRewardFromLedgerRow(supabase, {
      id: ledgerId,
      network: 'amazon',
      amount_cents: 500_000,
      status: 'accrued',
      external_ref: extRef,
      meta: (ledger as { meta: Record<string, unknown> }).meta,
      created_at: (ledger as { created_at: string }).created_at,
    });
    expect(created.created).toBe(true);
    rewardId = created.rewardId!;

    const { data: validating } = await supabase
      .from('creator_rewards')
      .select('status, creator_share_cents, hold_until')
      .eq('id', rewardId)
      .single();
    expect(validating?.status).toBe('VALIDATING');
    expect(Number(validating?.creator_share_cents)).toBe(200_000);

    const past = new Date(Date.now() - 86_400_000).toISOString();
    await supabase.from('creator_rewards').update({ hold_until: past }).eq('id', rewardId);

    const holds = await processExpiredRewardHolds(supabase);
    expect(holds.processed).toBeGreaterThanOrEqual(1);

    const { data: available } = await supabase
      .from('creator_rewards')
      .select('status')
      .eq('id', rewardId)
      .single();
    expect(available?.status).toBe('AVAILABLE');

    const payout = await createManualRewardPayout(supabase, {
      userId: testUserId,
      amountCents: 200_000,
      speiReference: `STAGING-QA-${RUN_ID}`,
      createdBy: actorId,
      rewardIds: [rewardId],
    });
    expect(payout.ok).toBe(true);

    const { data: paid } = await supabase
      .from('creator_rewards')
      .select('status, payout_id')
      .eq('id', rewardId)
      .single();
    expect(paid?.status).toBe('PAID');
    expect(paid?.payout_id).toBeTruthy();

    const { count } = await supabase
      .from('reward_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('entity_id', rewardId)
      .eq('event_type', 'reward_paid');
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it(
    '6) abusos críticos',
    async () => {
    const dupVote = await supabase.from('offer_votes').insert({
      offer_id: offerIds[0],
      user_id: voterIds[0],
      value: 2,
    });
    expect(dupVote.error).toBeTruthy();

    const selfVoteOwner = testUserId;
    const selfVoteOffer = offerIds[0];
    const { data: offerRow } = await supabase
      .from('offers')
      .select('created_by')
      .eq('id', selfVoteOffer)
      .single();
    expect((offerRow as { created_by: string }).created_by).toBe(selfVoteOwner);

    const dupReward = await supabase.from('creator_rewards').insert({
      creator_id: testUserId,
      offer_id: postUnlockOfferId,
      ledger_entry_id: ledgerId,
      network: 'amazon',
      gross_commission_cents: 1000,
      creator_share_cents: 400,
      platform_share_cents: 600,
      creator_share_bps: 4000,
      attribution_method: 'sub_id',
      attribution_confidence: 'high',
      status: 'VALIDATING',
      hold_until: new Date().toISOString(),
    });
    expect(dupReward.error).toBeTruthy();

    const belowMin = await createManualRewardPayout(supabase, {
      userId: testUserId,
      amountCents: 5000,
      speiReference: 'STAGING-QA-LOW',
      createdBy: actorId,
    });
    expect(belowMin.ok).toBe(false);

    const dupPayout = await createManualRewardPayout(supabase, {
      userId: testUserId,
      amountCents: 200_000,
      speiReference: `STAGING-QA-DUP-${RUN_ID}`,
      createdBy: actorId,
      rewardIds: [rewardId],
    });
    expect(dupPayout.ok).toBe(false);

    const reversed = await reverseReward(supabase, rewardId, actorId, 'abuse test');
    expect(reversed).toBe(false);

    const clawback = await createPaidRewardClawbackAdjustment(supabase, {
      rewardId,
      actorId,
      reason: 'QA staging clawback',
      ledgerEntryId: ledgerId,
    });
    expect(clawback.ok).toBe(true);

    const { data: foreignOffer } = await supabase
      .from('offers')
      .select('id, created_by')
      .neq('created_by', testUserId)
      .in('status', ['approved', 'published'])
      .limit(1)
      .maybeSingle();
    expect(foreignOffer?.id).toBeTruthy();
    const foreignOfferId = (foreignOffer as { id: string }).id;
    const foreignCreatorId = (foreignOffer as { created_by: string }).created_by;

    const mismatch = await resolveCommissionAttribution(supabase, {
      id: 'qa-mismatch',
      network: 'amazon',
      amount_cents: 1000,
      status: 'accrued',
      offer_id: foreignOfferId,
      creator_id: testUserId,
    });
    expect(mismatch.matched).toBe(false);
    if (!mismatch.matched) expect(mismatch.reason).toBe('creator_offer_mismatch');

    const wrongLedgerRef = `qa-wrong-${RUN_ID}`;
    const { data: wrongLedger } = await supabase
      .from('affiliate_ledger_entries')
      .insert({
        network: 'amazon',
        amount_cents: 10_000,
        currency: 'MXN',
        status: 'accrued',
        external_ref: wrongLedgerRef,
        source: 'manual',
      })
      .select('id')
      .single();

    const manualWrong = await assignManualLedgerAttribution(supabase, {
      ledgerEntryId: (wrongLedger as { id: string }).id,
      offerId: foreignOfferId,
      actorId,
      reason: 'qa attribution to foreign offer',
    });
    if (manualWrong.ok) {
      const { data: rw } = await supabase
        .from('creator_rewards')
        .select('creator_id')
        .eq('id', manualWrong.rewardId)
        .maybeSingle();
      expect(rw?.creator_id).toBe(foreignCreatorId);
      expect(rw?.creator_id).not.toBe(testUserId);
    } else {
      expect(manualWrong.error).toBeTruthy();
    }
    },
    60_000,
  );
});
