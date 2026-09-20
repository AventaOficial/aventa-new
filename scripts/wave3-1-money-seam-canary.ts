/**
 * WAVE 3.1 — Money seam canary (staging only).
 * Isolated Click→Conversion→Commission adversarial checks + settlement boundary.
 * Does NOT enable SETTLEMENT_BRIDGE, Rewards, or payouts.
 *
 *   npx tsx scripts/wave3-1-money-seam-canary.ts
 *   npx tsx scripts/wave3-1-money-seam-canary.ts --execute
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
  seamCommissionToSettlement,
} from '@/lib/wave3';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { resolveConversionAttributionStrict } from '@/lib/attribution/resolveConversionAttribution';
import { recordConversion } from '@/lib/economy/recordConversion';
import { recordCommission } from '@/lib/economy/recordCommission';
import { settleCommission } from '@/lib/economy/settlement/settleCommission';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

const ROOT = process.cwd();
const OUT = join(ROOT, 'scripts', '_wave3_reports');
const E2E_LATEST = join(OUT, 'wave3-staging-e2e-latest.json');

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
  if (error) throw new Error(`${table}.${col}: ${error.message}`);
  return count ?? 0;
}

async function headCount(sb: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/does not exist|Could not find the table/i.test(error.message)) return null;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const stamp = String(Date.now());
  loadEnvFile(join(ROOT, '.env.local'));
  if (!process.env.MONEY_PATH_FROZEN) process.env.MONEY_PATH_FROZEN = 'true';
  process.env.SETTLEMENT_BRIDGE_ENABLED = 'false';
  process.env.REWARDS_PROGRAM_ACTIVE = 'false';
  process.env.COMMISSION_PROGRAM_ACTIVE = 'false';
  process.env.DISTRIBUTION_ENGINE_ENABLED = 'false';

  mkdirSync(OUT, { recursive: true });
  const flagsBefore = snapshotWave3Flags();
  const guard = assertWave3StagingOnly(process.env);
  if (!guard.ok) {
    const abort = { ok: false, phase: 'guard', reason: guard.reason, flagsBefore };
    writeFileSync(join(OUT, 'wave3-1-money-seam-canary-latest.json'), JSON.stringify(abort, null, 2));
    console.error(JSON.stringify(abort, null, 2));
    process.exit(1);
  }
  if (isSettlementBridgeEnabled() || isRewardsProgramActive()) {
    console.error('ABORT: settlement/rewards must stay OFF');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const e2e = existsSync(E2E_LATEST)
    ? (JSON.parse(readFileSync(E2E_LATEST, 'utf8')) as {
        offerId?: string;
        clickId?: string;
        conversionId?: string;
        commissionId?: string;
      })
    : {};

  const report: Record<string, unknown> = {
    ok: false,
    mode: execute ? 'execute' : 'dry_run',
    guard,
    flagsBefore,
    e2eRefs: {
      offerId: e2e.offerId ?? null,
      clickId: e2e.clickId ?? null,
      conversionId: e2e.conversionId ?? null,
      commissionId: e2e.commissionId ?? null,
    },
    cases: {} as Record<string, unknown>,
  };

  if (!execute) {
    report.ok = true;
    report.note = 'dry-run — re-run with --execute';
    report.flagsAfter = restoreWave3FailClosedFlags();
    writeFileSync(join(OUT, 'wave3-1-money-seam-canary-latest.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!e2e.offerId || !e2e.clickId || !e2e.conversionId || !e2e.commissionId) {
    report.reason = 'missing_e2e_ids';
    report.flagsAfter = restoreWave3FailClosedFlags();
    writeFileSync(join(OUT, 'wave3-1-money-seam-canary-latest.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const offerId = e2e.offerId;
  const clickId = e2e.clickId;
  const conversionId = e2e.conversionId;
  const commissionId = e2e.commissionId;
  const cases = report.cases as Record<string, unknown>;

  try {
    const { data: convRow } = await sb
      .from('affiliate_conversions')
      .select('external_conversion_id')
      .eq('id', conversionId)
      .maybeSingle();
    const extConv = (convRow as { external_conversion_id?: string } | null)
      ?.external_conversion_id;
    if (!extConv) throw new Error('missing_external_conversion_id');

    const replayConv = await recordConversion(sb, {
      source: 'manual',
      network: 'mercadolibre',
      externalConversionId: extConv,
      occurredAt: new Date(),
      clickId,
      offerId,
      actor: 'wave3_1_canary',
    });
    cases.conversion_replay = {
      ok: Boolean(replayConv?.reused) && replayConv?.conversionId === conversionId,
      reused: replayConv?.reused ?? false,
      conversionId: replayConv?.conversionId ?? null,
      rowsForExternal: await countEq(
        sb,
        'affiliate_conversions',
        'external_conversion_id',
        extConv,
      ),
    };

    const { data: commRow } = await sb
      .from('affiliate_commissions')
      .select('external_commission_id')
      .eq('id', commissionId)
      .maybeSingle();
    const extComm = (commRow as { external_commission_id?: string } | null)
      ?.external_commission_id;
    if (!extComm) throw new Error('missing_external_commission_id');

    const replayComm = await recordCommission(sb, {
      conversionId,
      source: 'manual',
      network: 'mercadolibre',
      externalCommissionId: extComm,
      grossCommissionCents: 1250,
      occurredAt: new Date(),
      status: 'pending',
      actor: 'wave3_1_canary',
    });
    cases.commission_replay = {
      ok: Boolean(replayComm?.reused) && replayComm?.commissionId === commissionId,
      reused: replayComm?.reused ?? false,
      commissionId: replayComm?.commissionId ?? null,
      rowsForConversion: await countEq(sb, 'affiliate_commissions', 'conversion_id', conversionId),
    };

    const concurrent = await Promise.all(
      [`wave3-1-conc-a-${stamp}`, `wave3-1-conc-b-${stamp}`].map((externalCommissionId) =>
        recordCommission(sb, {
          conversionId,
          source: 'manual',
          network: 'mercadolibre',
          externalCommissionId,
          grossCommissionCents: 999,
          occurredAt: new Date(),
          status: 'pending',
          actor: 'wave3_1_canary',
        }),
      ),
    );
    const afterConcurrent = await countEq(
      sb,
      'affiliate_commissions',
      'conversion_id',
      conversionId,
    );
    cases.concurrent_commission_creation = {
      ok: afterConcurrent === 1,
      results: concurrent.map((r) => ({
        id: r?.commissionId ?? null,
        reused: r?.reused ?? null,
      })),
      rowsForConversion: afterConcurrent,
    };

    const missing = await recordConversion(sb, {
      source: 'manual',
      network: 'mercadolibre',
      externalConversionId: `wave3-1-missing-click-${stamp}`,
      occurredAt: new Date(),
      clickId: null,
      offerId,
      actor: 'wave3_1_canary',
    });
    cases.missing_click = {
      ok:
        Boolean(missing?.conversionId) &&
        missing?.attributionStatus === 'unattributed' &&
        missing.clickId == null,
      conversionId: missing?.conversionId ?? null,
      attributionStatus: missing?.attributionStatus ?? null,
      clickId: missing?.clickId ?? null,
    };

    const anonClick = await recordAttributedClick(sb, {
      offerId,
      clickerUserId: null,
      ip: `wave31-anon-${stamp}`,
    });
    cases.anonymous_actor = {
      ok: Boolean(anonClick?.clickId),
      clickId: anonClick?.clickId ?? null,
      reused: anonClick?.reused ?? null,
    };

    const conflict = await resolveConversionAttributionStrict(sb, {
      clickId,
      offerId: '00000000-0000-4000-8000-000000000099',
      conversionAt: new Date(),
    });
    const hasConflict = conflict.conflicts.some((c) => c.kind === 'conflicting_offer');
    cases.attribution_conflict = {
      ok:
        conflict.attributionStatus === 'attributed' &&
        conflict.offerId === offerId &&
        hasConflict &&
        conflict.fraudSignals.includes('conflicting_offer'),
      attributionStatus: conflict.attributionStatus,
      resolvedOfferId: conflict.offerId,
      clickOfferWins: conflict.offerId === offerId,
      conflicts: conflict.conflicts,
      fraudSignals: conflict.fraudSignals,
    };

    // Phase F — approve commission, attempt settle with flags OFF
    await sb
      .from('affiliate_commissions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', commissionId);

    const { data: approved } = await sb
      .from('affiliate_commissions')
      .select('id, status, ledger_entry_id')
      .eq('id', commissionId)
      .maybeSingle();

    const ledgerBefore = await headCount(sb, 'affiliate_ledger_entries');
    const rewardsBefore = await headCount(sb, 'creator_rewards');

    const seamBlocked = await seamCommissionToSettlement(sb, { commissionId });
    const directBlocked = await settleCommission(sb, {
      commissionId,
      actor: 'wave3_1_boundary',
    });

    const ledgerAfter = await headCount(sb, 'affiliate_ledger_entries');
    const rewardsAfter = await headCount(sb, 'creator_rewards');

    cases.settlement_boundary = {
      commissionRecognized: (approved as { status?: string } | null)?.status === 'approved',
      commissionStatus: (approved as { status?: string } | null)?.status ?? null,
      ledgerEntryIdStillNull:
        (approved as { ledger_entry_id?: string | null } | null)?.ledger_entry_id == null,
      seamCode: seamBlocked.diagnostic.code,
      seamOkForbidden: seamBlocked.diagnostic.ok === false,
      directReason: directBlocked.reason,
      directOkForbidden: directBlocked.ok === false,
      ledgerDelta: (ledgerAfter ?? 0) - (ledgerBefore ?? 0),
      rewardsDelta: (rewardsAfter ?? 0) - (rewardsBefore ?? 0),
      flags: {
        settlementOn: isSettlementBridgeEnabled(),
        moneyFrozen: isMoneyPathFrozen(),
      },
      ok:
        (approved as { status?: string } | null)?.status === 'approved' &&
        seamBlocked.diagnostic.code === 'SETTLEMENT_DISABLED' &&
        directBlocked.ok === false &&
        directBlocked.reason === 'settlement_disabled' &&
        (ledgerAfter ?? 0) === (ledgerBefore ?? 0) &&
        (rewardsAfter ?? 0) === (rewardsBefore ?? 0),
    };

    cases.uniqueness = {
      ok: true,
      conversionsForClick: await countEq(sb, 'affiliate_conversions', 'click_id', clickId),
      commissionsForConversion: await countEq(
        sb,
        'affiliate_commissions',
        'conversion_id',
        conversionId,
      ),
    };
    // Primary E2E conversion may share click with only attributed rows; allow ≥1
    (cases.uniqueness as { ok: boolean }).ok =
      (cases.uniqueness as { commissionsForConversion: number }).commissionsForConversion === 1;

    const caseResults = Object.values(cases) as Array<{ ok?: boolean }>;
    report.ok = caseResults.every((c) => c.ok === true);
  } finally {
    report.flagsAfter = restoreWave3FailClosedFlags();
  }

  writeFileSync(join(OUT, 'wave3-1-money-seam-canary-latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT, `wave3-1-money-seam-canary-${stamp}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  restoreWave3FailClosedFlags();
  process.exit(1);
});
