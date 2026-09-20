/**
 * Staging-only: settlement → ledger attribution seam validation.
 * Rewards stay OFF. Does not touch M2 ledger. No production writes.
 *
 *   npx tsx scripts/settlement-ledger-attribution-staging.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
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
import { resolveCommissionAttribution } from '@/lib/rewards/attribution/matcher';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';

const STAMP = String(Date.now());
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

async function main() {
  loadEnv(join(process.cwd(), '.env.local'));
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';
  process.env.MONEY_PATH_FROZEN = 'false';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'true';

  const guard = assertWave3StagingOnly(process.env);
  const report: Record<string, unknown> = {
    ok: false,
    campaign: 'settlement_ledger_attribution_seam',
    flagsBefore: snapshotWave3Flags(),
    guard,
  };
  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, 'settlement-ledger-attribution-staging-latest.json');

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
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Prefer an unlocked creator with participating offer from prior M3.1 work.
    const { data: unlocked } = await sb
      .from('profiles')
      .select('id, reward_program_unlocked_at')
      .not('reward_program_unlocked_at', 'is', null)
      .limit(5);
    const creatorId = (unlocked?.[0] as { id?: string } | undefined)?.id;
    if (!creatorId) {
      report.reason = 'no_unlocked_creator';
      return;
    }
    const { data: offers } = await sb
      .from('offers')
      .select('id, created_by, offer_url, status, created_at')
      .eq('created_by', creatorId)
      .in('status', ['approved', 'published'])
      .order('created_at', { ascending: false })
      .limit(10);
    const offer = (offers ?? []).find((o) =>
      /amazon\./i.test(String((o as { offer_url?: string }).offer_url ?? '')),
    ) as { id: string; offer_url?: string } | undefined;
    if (!offer?.id) {
      report.reason = 'no_amazon_offer';
      return;
    }

    const { data: others } = await sb
      .from('profiles')
      .select('id')
      .neq('id', creatorId)
      .limit(3);
    const clickerId = (others?.[0] as { id?: string } | undefined)?.id;
    if (!clickerId) {
      report.reason = 'no_clicker';
      return;
    }

    const { data: m2Before } = await sb
      .from('affiliate_ledger_entries')
      .select('id, click_id, offer_id, creator_id, attributable, attribution_method')
      .eq('id', M2_LEDGER)
      .maybeSingle();

    const click = await recordAttributedClick(sb, {
      offerId: offer.id,
      clickerUserId: clickerId,
      ip: `seam-attr-${STAMP}`,
    });
    if (!click?.clickId) {
      report.reason = 'click_failed';
      return;
    }

    const subId = encodeAventaSubId(offer.id, click.clickId);
    const conv = await recordConversion(sb, {
      source: 'manual',
      network: 'amazon',
      externalConversionId: `seam-attr-conv-${STAMP}`,
      occurredAt: new Date(),
      clickId: click.clickId,
      offerId: offer.id,
      rawReference: { seam: true, ascsubtag: subId },
      actor: 'settlement_ledger_attribution_seam',
    });
    if (!conv?.conversionId || conv.attributionStatus !== 'attributed') {
      report.reason = 'conversion_not_attributed';
      report.conv = conv;
      return;
    }

    const comm = await recordCommission(sb, {
      conversionId: conv.conversionId,
      source: 'manual',
      network: 'amazon',
      externalCommissionId: `seam-attr-comm-${STAMP}`,
      grossCommissionCents: 1800,
      currency: 'MXN',
      occurredAt: new Date(),
      status: 'pending',
      actor: 'settlement_ledger_attribution_seam',
    });
    if (!comm?.commissionId) {
      report.reason = 'commission_failed';
      return;
    }

    await sb
      .from('affiliate_commissions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', comm.commissionId);

    const settled = await settleCommission(sb, {
      commissionId: comm.commissionId,
      actor: 'settlement_ledger_attribution_seam',
    });
    report.settlement = {
      ok: settled.ok,
      reason: settled.reason ?? null,
      ledgerEntryId: settled.ledgerEntryId,
      reused: settled.reused,
      createdCreatorReward: settled.createdCreatorReward,
    };
    if (!settled.ok || !settled.ledgerEntryId) {
      report.reason = `settle_failed:${settled.reason}`;
      return;
    }

    const { data: ledger } = await sb
      .from('affiliate_ledger_entries')
      .select(
        'id, click_id, offer_id, creator_id, tracking_tag, attributable, attribution_method, attribution_confidence, network, amount_cents, status, external_ref, meta',
      )
      .eq('id', settled.ledgerEntryId)
      .maybeSingle();

    report.ledger = ledger;
    const ledgerOk =
      ledger?.click_id === click.clickId &&
      ledger?.offer_id === offer.id &&
      ledger?.creator_id === creatorId &&
      ledger?.attributable === true &&
      ledger?.attribution_method === 'sub_id' &&
      ledger?.attribution_confidence === 'high' &&
      typeof ledger?.tracking_tag === 'string' &&
      ledger.tracking_tag.includes(offer.id);

    // Reward dry-run: resolver only — Rewards program OFF, freeze restored later.
    const attribution = await resolveCommissionAttribution(sb, {
      id: String(ledger?.id),
      network: 'amazon',
      amount_cents: Number(ledger?.amount_cents ?? 0),
      status: String(ledger?.status ?? 'accrued'),
      external_ref: (ledger?.external_ref as string) ?? null,
      meta: (ledger?.meta as Record<string, unknown>) ?? null,
      click_id: (ledger?.click_id as string) ?? null,
      offer_id: (ledger?.offer_id as string) ?? null,
      creator_id: (ledger?.creator_id as string) ?? null,
      sub_id_raw: (ledger?.tracking_tag as string) ?? null,
    });
    report.rewardDryRun = {
      matched: attribution.matched,
      method: attribution.matched ? attribution.match.method : null,
      confidence: attribution.matched ? attribution.match.confidence : null,
      reason: attribution.matched ? null : attribution.reason,
      offerId: attribution.matched ? attribution.match.offerId : null,
      creatorId: attribution.matched ? attribution.match.creatorId : null,
      rewardsProgramActive: false,
      note: 'resolver only — createRewardFromLedgerEntry not called',
    };

    const { data: m2After } = await sb
      .from('affiliate_ledger_entries')
      .select('id, click_id, offer_id, creator_id, attributable, attribution_method')
      .eq('id', M2_LEDGER)
      .maybeSingle();

    report.m2Intact =
      JSON.stringify(m2Before) === JSON.stringify(m2After) ||
      ((m2After as { creator_id?: string | null } | null)?.creator_id == null &&
        (m2After as { click_id?: string | null } | null)?.click_id == null &&
        (m2After as { offer_id?: string | null } | null)?.offer_id == null);

    report.ok =
      Boolean(ledgerOk) &&
      attribution.matched === true &&
      Boolean(report.m2Intact) &&
      settled.createdCreatorReward === false;

    if (!ledgerOk) report.reason = 'ledger_attribution_fields_mismatch';
    else if (!attribution.matched) report.reason = 'resolver_not_matched';
  } finally {
    report.flagsAfter = restoreWave3FailClosedFlags();
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.error(`[seam] wrote ${outPath}`);
    console.error(JSON.stringify(report, null, 2));
  }
  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => {
  restoreWave3FailClosedFlags();
  console.error('FATAL', e instanceof Error ? e.message : e);
  process.exit(1);
});
