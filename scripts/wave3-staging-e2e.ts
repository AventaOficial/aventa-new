/**
 * WAVE 3 staging E2E — one controlled opportunity through seams.
 * Settlement OFF. Rewards OFF. Process-scoped flags only.
 *
 *   npx tsx scripts/wave3-staging-e2e.ts
 *   npx tsx scripts/wave3-staging-e2e.ts --execute
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assertWave3StagingOnly,
  restoreWave3FailClosedFlags,
  snapshotWave3Flags,
  seamS8toS9,
  seamS9toS7,
  seamS7toModeration,
  seamModerationToDistribution,
  seamDistributionToClick,
  seamClickToConversion,
  seamConversionToCommission,
} from '@/lib/wave3';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import {
  S71_SEED_AUTHOR_ID,
  assertDedicatedMachineAuthor,
} from '@/lib/bots/ingest/stagingSupplyWindow';
import { drainDistributionPublications } from '@/lib/distribution/drain';
import { createControlledDistributionAdapter } from '@/lib/distribution/providers/controlled';
import { isSettlementBridgeEnabled } from '@/lib/economy/settlement/isSettlementBridgeEnabled';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';

const ROOT = process.cwd();
const OUT = join(ROOT, 'scripts', '_wave3_reports');
const AUTHOR_PATH = join(ROOT, 'scripts', '_s72_reports', 's72-author-latest.json');

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

function loadAuthor(): string | null {
  const fromEnv =
    process.env.S9_MACHINE_AUTHOR_ID?.trim() ||
    process.env.BOT_INGEST_USER_ID?.trim() ||
    null;
  if (fromEnv) return fromEnv;
  if (!existsSync(AUTHOR_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(AUTHOR_PATH, 'utf8')) as {
      author?: { id?: string };
    };
    return raw.author?.id?.trim() || null;
  } catch {
    return null;
  }
}

async function countTable(sb: SupabaseClient, table: string) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
  if (error) return { count: null as number | null, error: error.message, na: true };
  return { count: count ?? 0, error: null as string | null, na: false };
}

async function snapshot(sb: SupabaseClient) {
  const tables = [
    'offers',
    'distribution_publications',
    'distribution_events',
    'reward_outbound_clicks',
    'affiliate_conversions',
    'affiliate_commissions',
    'affiliate_ledger_entries',
    'creator_rewards',
  ] as const;
  const out: Record<string, number | null> = {};
  const na: string[] = [];
  for (const t of tables) {
    const r = await countTable(sb, t);
    out[t] = r.count;
    if (r.na) na.push(t);
  }
  const pending = await sb
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null);
  out.offers_pending = pending.count ?? null;
  return { counts: out, na };
}

function writeReport(stamp: string, report: Record<string, unknown>) {
  writeFileSync(join(OUT, 'wave3-staging-e2e-latest.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT, `wave3-staging-e2e-${stamp}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const execute = process.argv.includes('--execute');
  const stamp = String(Date.now());
  loadEnvFile(join(ROOT, '.env.local'));
  if (!process.env.MONEY_PATH_FROZEN) process.env.MONEY_PATH_FROZEN = 'true';

  mkdirSync(OUT, { recursive: true });
  const flagsBefore = snapshotWave3Flags();

  const guard = assertWave3StagingOnly(process.env);
  if (!guard.ok) {
    const abort = { ok: false, phase: 'guard', reason: guard.reason, flagsBefore };
    writeReport(stamp, abort);
    process.exit(1);
  }

  if (isSettlementBridgeEnabled()) {
    console.error('ABORT: SETTLEMENT_BRIDGE must be OFF for Wave3 E2E (use separate canary)');
    process.exit(1);
  }
  if (isRewardsProgramActive()) {
    console.error('ABORT: REWARDS must be OFF');
    process.exit(1);
  }

  const authorId = loadAuthor();
  const authorCheck = authorId
    ? assertDedicatedMachineAuthor(authorId)
    : { ok: false, reason: 'missing_author' };
  if (!authorCheck.ok || !authorId || authorId === S71_SEED_AUTHOR_ID) {
    console.error('ABORT: dedicated machine author required');
    process.exit(1);
  }
  process.env.BOT_INGEST_USER_ID = authorId;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const baseline = await snapshot(sb);
  const candidateUrl = `https://articulo.mercadolibre.com.mx/MLM${stamp.slice(-8)}-wave3-e2e`;
  const opportunity = {
    url: candidateUrl,
    canonicalUrl: candidateUrl,
    title: 'Wave3 E2E Bluetooth Headphones Premium ANC',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_WAVE3E2E.jpg',
    salePrice: 699,
    declaredOriginalPrice: 1799,
    store: 'Mercado Libre',
    signals: {
      originalPriceProvenance: 'listing_card' as const,
      cardDiscountSource: 'card_strikethrough' as const,
      historyReady: true,
    },
  };

  process.env.SUPPLY_AUTOMATION_ENABLED = 'true';
  const s8s9 = await seamS8toS9({
    candidate: opportunity,
    mode: 'dry_run',
    skipAdapterFetch: true,
  });

  const report: Record<string, unknown> = {
    ok: false,
    mode: execute ? 'execute' : 'dry_run',
    guard,
    authorIdPrefix: authorId.slice(0, 8),
    flagsBefore,
    baseline,
    candidateUrl,
    seams: { 'S8→S9': s8s9.diagnostic },
    settlement: 'OFF_by_design',
    rewards: 'OFF_by_design',
  };

  if (!s8s9.decision.eligible || !s8s9.evaluation) {
    report.reason = 'not_eligible';
    report.flagsAfter = restoreWave3FailClosedFlags();
    writeReport(stamp, report);
    return;
  }

  if (!execute) {
    report.ok = true;
    report.note = 'dry-run only — re-run with --execute';
    report.flagsAfter = restoreWave3FailClosedFlags();
    writeReport(stamp, report);
    return;
  }

  process.env.DISTRIBUTION_ENGINE_ENABLED = 'true';

  let offerId: string | null = null;
  try {
    const config = loadBotIngestConfig('standard');
    await withMachinePendingWritesEnabled(async () => {
      const s9s7 = await seamS9toS7({
        candidate: opportunity,
        evaluation: s8s9.evaluation!,
        config,
        decision: s8s9.decision,
        requireDedicatedAuthor: true,
      });
      (report.seams as Record<string, unknown>)['S9→S7'] = s9s7.diagnostic;
      if (s9s7.write && s9s7.write.ok === true) {
        offerId = s9s7.write.offerId;
      }
    });

    if (!offerId) {
      report.reason = 's7_write_failed';
      throw new Error('s7_write_failed');
    }

    const mod = await seamS7toModeration(sb, {
      offerId,
      decision: 'approved',
    });
    (report.seams as Record<string, unknown>)['S7→Moderation'] = mod.diagnostic;

    const dist = await seamModerationToDistribution(offerId, {
      supabase: sb,
      env: process.env,
    });
    (report.seams as Record<string, unknown>)['Mod→Dist'] = dist.diagnostic;

    await drainDistributionPublications({
      supabase: sb,
      env: process.env,
      adapters: {
        telegram: createControlledDistributionAdapter({ scenario: 'success' }),
      },
    });

    const click = await seamDistributionToClick(sb, {
      offerId,
      clickerUserId: authorId,
    });
    (report.seams as Record<string, unknown>)['Dist→Click'] = click.diagnostic;
    report.offerId = offerId;
    report.clickId = click.clickId;

    // Insert probe detects missing money tables (select head may not error)
    const probeExt = `wave3-schema-probe-${stamp}`;
    const convProbe = await sb
      .from('affiliate_conversions')
      .insert({
        source: 'manual',
        network: 'mercadolibre',
        external_conversion_id: probeExt,
        occurred_at: new Date().toISOString(),
        status: 'received',
        attribution_status: 'unattributed',
        raw_reference: { wave3_probe: true },
      })
      .select('id')
      .maybeSingle();

    const schemaMissing =
      Boolean(convProbe.error) &&
      /schema cache|does not exist|Could not find the table/i.test(
        convProbe.error!.message,
      );

    if (schemaMissing) {
      report.moneyFoundationSchema = {
        available: false,
        error: convProbe.error!.message,
        blocker:
          'affiliate_conversions missing on staging — proven through Click. Do not invent DDL here.',
      };
      report.anomaly = 'money_foundation_schema_missing';
      report.ok = false;
      report.partialPass = {
        through: 'Dist→Click',
        seamsOk: ['S8→S9', 'S9→S7', 'S7→Moderation', 'Mod→Dist', 'Dist→Click'],
        blocked: ['Click→Conversion', 'Conv→Commission', 'Comm→Settlement'],
      };
    } else {
      if (convProbe.data && (convProbe.data as { id?: string }).id) {
        await sb
          .from('affiliate_conversions')
          .delete()
          .eq('id', (convProbe.data as { id: string }).id);
      }

      const conv = await seamClickToConversion(sb, {
        clickId: click.clickId,
        offerId,
        externalConversionId: `wave3-e2e-conv-${stamp}`,
      });
      (report.seams as Record<string, unknown>)['Click→Conversion'] = conv.diagnostic;
      report.conversionId = conv.conversionId;

      if (conv.conversionId) {
        const comm = await seamConversionToCommission(sb, {
          conversionId: conv.conversionId,
          externalCommissionId: `wave3-e2e-comm-${stamp}`,
          grossCommissionCents: 1250,
          status: 'pending',
        });
        (report.seams as Record<string, unknown>)['Conv→Commission'] = comm.diagnostic;
        report.commissionId = comm.commissionId;
      }

      if (!conv.conversionId) {
        report.anomaly = 'conversion_failed';
      }
      if (!report.commissionId) {
        report.anomaly = (report.anomaly as string) ?? 'commission_failed';
      }
    }

    const after = await snapshot(sb);
    report.after = after;
    report.deltas = Object.fromEntries(
      Object.keys(baseline.counts).map((k) => {
        const a = baseline.counts[k];
        const b = after.counts[k];
        return [k, a != null && b != null ? b - a : null];
      }),
    );

    const ledgerDelta = (report.deltas as Record<string, number | null>)
      .affiliate_ledger_entries;
    const rewardsDelta = (report.deltas as Record<string, number | null>).creator_rewards;

    if (!report.anomaly) {
      report.ok =
        Boolean(offerId) &&
        Boolean(click.clickId) &&
        Boolean(report.conversionId) &&
        Boolean(report.commissionId) &&
        (ledgerDelta === 0 || ledgerDelta == null) &&
        (rewardsDelta === 0 || rewardsDelta == null) &&
        !isSettlementBridgeEnabled() &&
        !isRewardsProgramActive();
    } else {
      report.ok = false;
    }

    if (ledgerDelta && ledgerDelta > 0) {
      report.anomaly = 'unexpected_ledger_delta';
      report.ok = false;
    }
    if (rewardsDelta && rewardsDelta > 0) {
      report.anomaly = 'unexpected_rewards_delta';
      report.ok = false;
    }
  } finally {
    report.flagsAfter = restoreWave3FailClosedFlags();
  }

  writeReport(stamp, report);
  if (report.anomaly === 'money_foundation_schema_missing') process.exit(2);
  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err);
  restoreWave3FailClosedFlags();
  process.exit(1);
});
