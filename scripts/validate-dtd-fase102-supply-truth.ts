/**
 * FASE 10.2 — persistencia controlada de Supply Truth.
 * No inserta ofertas. No publica. No toca rewards.
 */
import { createClient } from '@supabase/supabase-js';
import { isDayToDayFlagOn } from '../lib/hunter/dayToDay/config';
import { loadBotIngestConfig } from '../lib/bots/ingest/config';
import {
  getSupplyTruth,
  persistIngestSupplyRuns,
  persistCommunitySupplyRun,
  recordSupplyRun,
  evaluateCommunitySubmission,
} from '../lib/hunter/supply';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const supabase = admin();
  const cfg = loadBotIngestConfig();
  const now = new Date();
  const startedAt = new Date(now.getTime() - 8000).toISOString();
  const finishedAt = now.toISOString();
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  if (!supabase) {
    console.log(JSON.stringify({ persisted: false, reason: 'no_client' }, null, 2));
    return;
  }

  const a = await persistIngestSupplyRuns({
    runId: `fase102-${stamp}-ml`,
    startedAt,
    finishedAt,
    sourceStats: {
      ml_worker: { collected: 36, evaluated: 20, inserted: 8, duplicate: 10, skipped: 2, errors: 0 },
    },
    qualificationBySource: {
      ml_worker: { verifiedDeals: 8, promotions: 0, potentialDeals: 4, catalogOnly: 8 },
    },
    pendingBySource: { ml_worker: 8 },
    supabase,
  });

  const ev = evaluateCommunitySubmission({
    title: 'Taladro community FASE 10.2',
    store: 'Mercado Libre',
    price: 899,
    originalPrice: 1299,
    imageUrl: null,
    offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-taladro-_JM',
  });
  const b = await persistCommunitySupplyRun({
    runId: `fase102-${stamp}-community`,
    startedAt,
    finishedAt,
    evaluation: ev,
    insertedPending: true,
    supabase,
  });

  const c = await persistIngestSupplyRuns({
    runId: `fase102-${stamp}-dup`,
    startedAt,
    finishedAt,
    sourceStats: {
      ml_worker: { collected: 12, evaluated: 12, inserted: 0, duplicate: 12, skipped: 0, errors: 0 },
    },
    qualificationBySource: {
      ml_worker: { verifiedDeals: 4, promotions: 0, potentialDeals: 0, catalogOnly: 8 },
    },
    supabase,
  });

  const d = await persistIngestSupplyRuns({
    runId: `fase102-${stamp}-zero`,
    startedAt,
    finishedAt,
    sourceStats: {
      amazon_asin: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 0 },
      env_urls: { collected: 3, evaluated: 0, inserted: 0, duplicate: 0, skipped: 3, errors: 0 },
    },
    supabase,
  });

  const e = await persistIngestSupplyRuns({
    runId: `fase102-${stamp}-fail`,
    startedAt,
    finishedAt,
    sourceStats: {
      ml_api: { collected: 0, evaluated: 0, inserted: 0, duplicate: 0, skipped: 0, errors: 3 },
    },
    supabase,
  });

  const f = await recordSupplyRun(
    {
      runId: `fase102-${stamp}-ok`,
      sourceId: 'ml_worker',
      sourceFamily: 'external_worker',
      startedAt,
      finishedAt,
      status: 'ok',
      candidatesDiscovered: 10,
      candidatesQualified: 8,
      verifiedDeals: 3,
      pending: 3,
    },
    { supabase },
  );

  const again = await recordSupplyRun(
    {
      runId: `fase102-${stamp}-ok`,
      sourceId: 'ml_worker',
      sourceFamily: 'external_worker',
      startedAt,
      finishedAt,
      status: 'ok',
      verifiedDeals: 3,
    },
    { supabase },
  );

  const truth = await getSupplyTruth(supabase, { now });
  const count = await supabase
    .from('hunter_supply_runs')
    .select('run_id, source_id, verified_deals, status', { count: 'exact' })
    .like('run_id', `fase102-${stamp}%`);

  console.log(
    JSON.stringify(
      {
        insertedOffers: false,
        published: false,
        rewardsTouched: false,
        outcomes: { a, b, c, d, e, f, again },
        idempotentDuplicate: again.persisted && 'duplicate' in again ? again.duplicate : null,
        persistedRows: count.data,
        persistedCount: count.count,
        truth: {
          globalStatus: truth.globalStatus,
          recommendedAction: truth.recommendedAction,
          lastRunId: truth.lastRunId,
          h24: {
            verified: truth.windows.h24.verifiedDeals,
            candidates: truth.windows.h24.candidates,
            community: truth.windows.h24.communityVerified,
            machine: truth.windows.h24.machineVerified,
            contribution: truth.windows.h24.contribution.map((r) => ({
              sourceId: r.sourceId,
              verified: r.verifiedDeals,
              pct: r.contributionPct,
            })),
          },
          alerts: truth.alerts,
        },
        flags: {
          chedraui: isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED'),
          bodega: isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED'),
          walmart: isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED'),
          legacyAutoApproveWrite: cfg.legacyAutoApproveWriteEnabled,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
