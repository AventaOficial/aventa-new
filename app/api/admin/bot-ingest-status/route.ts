import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { getBotIngestPausedFromDb } from '@/lib/bots/ingest/botIngestPaused';
import {
  countBotOffersCreatedSinceMulti,
  getBotOfferCountStartUtc,
} from '@/lib/bots/ingest/botIngestDailyState';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { createServerClient } from '@/lib/supabase/server';

/**
 * S7 — authoritative machine supply scheduler is GitHub Actions ML worker
 * → POST /api/cron/bot-ingest-candidates (not Vercel cron bot-ingest).
 */
const AUTHORITATIVE_SCHEDULER = {
  kind: 'github_actions' as const,
  workflow: '.github/workflows/mercadolibre-worker.yml',
  schedule: '7,37 * * * *',
  ingest_path: '/api/cron/bot-ingest-candidates',
  discovery_only_default: true,
  note:
    'GHA sets WORKER_DISCOVERY_ONLY (default 1 → dryRun). Pending DB writes also require BOT_INGEST_MACHINE_PENDING_WRITES=1 and BOT_INGEST_ENABLED=1 plus bot author IDs. Vercel cron does not schedule bot-ingest.',
};

const TRACKED_ENV_KEYS = [
  'BOT_INGEST_ENABLED',
  'BOT_INGEST_MACHINE_PENDING_WRITES',
  'BOT_INGEST_USER_ID',
  'BOT_INGEST_USER_ID_TECH',
  'BOT_INGEST_USER_ID_STAPLES',
  'BOT_INGEST_TIMEZONE',
  'BOT_INGEST_NORMAL_MAX_MIN',
  'BOT_INGEST_NORMAL_MAX_MAX',
  'BOT_INGEST_BOOST_MAX',
  'BOT_INGEST_MORNING_SUSTAINED',
  'BOT_INGEST_MORNING_HOUR_START',
  'BOT_INGEST_MORNING_HOUR_END_EXCLUSIVE',
  'BOT_INGEST_MORNING_MAX_MIN',
  'BOT_INGEST_MORNING_MAX_MAX',
  'BOT_INGEST_DAILY_MAX',
  'BOT_INGEST_CANDIDATE_POOL_MAX',
  'BOT_INGEST_URLS',
  'BOT_INGEST_DISCOVER_ML',
  'BOT_INGEST_ML_QUERIES',
  'BOT_INGEST_ML_CATEGORY_IDS',
  'BOT_INGEST_ML_TECH_CATEGORY_IDS',
  'BOT_INGEST_ML_MIN_SOLD',
  'BOT_INGEST_ML_FETCH_REVIEWS',
  'BOT_INGEST_MIN_RATING',
  'BOT_INGEST_MIN_RATING_REVIEWS',
  'BOT_INGEST_AMAZON_ASINS',
  'BOT_INGEST_AMAZON_SOURCE',
  'BOT_INGEST_AMAZON_PAAPI_ENABLED',
  'AMAZON_PAAPI_ACCESS_KEY',
  'AMAZON_PAAPI_SECRET_KEY',
  'AMAZON_PAAPI_PARTNER_TAG',
  'BOT_INGEST_KEEPA_ENABLED',
  'KEEPA_API_KEY',
  'BOT_INGEST_MIN_DISCOUNT_PERCENT',
  'BOT_INGEST_AUTO_APPROVE',
  'BOT_INGEST_AUTO_APPROVE_MIN_SCORE',
  'BOT_INGEST_AUTO_APPROVE_WORKER_MIN_SCORE',
  'BOT_INGEST_AUTO_APPROVE_WORKER_MIN_DISCOUNT',
  'BOT_INGEST_AUTO_APPROVE_REQUIRE_IMAGE',
  'BOT_INGEST_WORKER_MAX_PER_RUN',
  'BOT_INGEST_REJECT_BELOW_SCORE',
  'BOT_INGEST_FORCE_PENDING_MIN_SCORE',
  'BOT_INGEST_CATEGORY',
  'BOT_INGEST_EXTERNAL_WORKER',
] as const;

function hasEnvValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function externalWorkerIngestEnabled(): boolean {
  const v = process.env.BOT_INGEST_EXTERNAL_WORKER?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function diagnoseOpsBottleneck(input: {
  enabled: boolean;
  paused: boolean;
  hasAuthor: boolean;
  machineWrites: boolean;
  pendingCount: number | null;
}): { bottleneck: string; detail: string } {
  if (!input.enabled) {
    return { bottleneck: 'ingest_disabled', detail: 'BOT_INGEST_ENABLED is off' };
  }
  if (input.paused) {
    return { bottleneck: 'ingest_paused', detail: 'bot ingest paused by owner' };
  }
  if (!input.hasAuthor) {
    return {
      bottleneck: 'missing_bot_user',
      detail: 'Configure BOT_INGEST_USER_ID or TECH+STAPLES pair',
    };
  }
  if (!input.machineWrites) {
    return {
      bottleneck: 'writes_disabled',
      detail:
        'BOT_INGEST_MACHINE_PENDING_WRITES default OFF; GHA also defaults WORKER_DISCOVERY_ONLY=1 (dryRun)',
    };
  }
  if ((input.pendingCount ?? 0) === 0) {
    return {
      bottleneck: 'pending_empty',
      detail:
        'Writes may be ON but queue empty — check last worker ops.bottleneck / S6.1 suppressions',
    };
  }
  return { bottleneck: 'none', detail: 'machine pending offers present' };
}

/** Estado operativo del bot de ingesta para owner/admin. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = loadBotIngestConfig();
  const pausedByOwner = await getBotIngestPausedFromDb();
  const machinePendingWrites = isMachinePendingWriteEnabled();

  let recentOffers: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    store: string | null;
    price: number;
  }> = [];
  let pendingCount: number | null = null;
  let insertedTodayApprox: number | null = null;

  if (cfg.botUserIdsForQuota.length > 0) {
    const supabase = createServerClient();
    const ids = cfg.botUserIdsForQuota;
    const { data: offers } = await supabase
      .from('offers')
      .select('id, title, status, created_at, store, price')
      .in('created_by', ids)
      .order('created_at', { ascending: false })
      .limit(12);
    recentOffers = (offers ?? []) as typeof recentOffers;

    const { count } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .in('created_by', ids)
      .eq('status', 'pending');
    pendingCount = count ?? null;

    const start = getBotOfferCountStartUtc(cfg.timezone);
    insertedTodayApprox = await countBotOffersCreatedSinceMulti(ids, start);
  }

  const envStatus = Object.fromEntries(
    TRACKED_ENV_KEYS.map((k) => {
      if (k === 'BOT_INGEST_EXTERNAL_WORKER') return [k, externalWorkerIngestEnabled()];
      if (k === 'BOT_INGEST_MACHINE_PENDING_WRITES') return [k, machinePendingWrites];
      if (k === 'BOT_INGEST_ENABLED') return [k, cfg.enabled];
      return [k, hasEnvValue(k)];
    }),
  ) as Record<(typeof TRACKED_ENV_KEYS)[number], boolean>;

  const workerPostsCandidates = externalWorkerIngestEnabled();
  const hasIngestSources =
    cfg.urlsFromEnv.length > 0 ||
    cfg.amazonAsins.length > 0 ||
    (cfg.discoverMlEnabled &&
      (cfg.mlQueries.length > 0 || cfg.mlCategoryIds.length > 0 || cfg.mlUseDefaultQueries)) ||
    workerPostsCandidates;

  const missingEnv: string[] = TRACKED_ENV_KEYS.filter((key) => {
    if (key === 'BOT_INGEST_MACHINE_PENDING_WRITES') return false;
    if (key === 'BOT_INGEST_ENABLED') return !cfg.enabled;
    if (key === 'BOT_INGEST_EXTERNAL_WORKER') return !workerPostsCandidates;
    return !envStatus[key];
  });
  if (cfg.enabled && !hasIngestSources) {
    missingEnv.push(
      'BOT_INGEST_fuentes: URLS, BOT_INGEST_DISCOVER_ML, BOT_INGEST_AMAZON_ASINS o BOT_INGEST_EXTERNAL_WORKER=1 (GHA worker → bot-ingest-candidates)',
    );
  }

  const avgNormal = (cfg.normalMaxPerRunMin + cfg.normalMaxPerRunMax) / 2;
  const estimatedProcessedPerDay = Math.min(
    cfg.dailyMaxOffers,
    Math.round(avgNormal * 48 + cfg.boostMaxOffers),
  );

  const ops = diagnoseOpsBottleneck({
    enabled: cfg.enabled,
    paused: pausedByOwner,
    hasAuthor: cfg.botUserIdsForQuota.length > 0,
    machineWrites: machinePendingWrites,
    pendingCount,
  });

  return NextResponse.json({
    enabled: cfg.enabled && !pausedByOwner,
    env_ingest_enabled: cfg.enabled,
    paused_by_owner: pausedByOwner,
    machine_pending_writes_enabled: machinePendingWrites,
    ops_bottleneck: ops.bottleneck,
    ops_bottleneck_detail: ops.detail,
    scheduler: AUTHORITATIVE_SCHEDULER,
    cron: {
      path: AUTHORITATIVE_SCHEDULER.ingest_path,
      schedule: AUTHORITATIVE_SCHEDULER.schedule,
      authoritative: AUTHORITATIVE_SCHEDULER.kind,
      deployment_note: AUTHORITATIVE_SCHEDULER.note,
    },
    config: {
      bot_user_id_configured: cfg.botUserIdsForQuota.length > 0,
      bot_author_dual_mode: cfg.botAuthorDualMode,
      profile: cfg.profile,
      timezone: cfg.timezone,
      normal_max_range: [cfg.normalMaxPerRunMin, cfg.normalMaxPerRunMax],
      boost_max_offers: cfg.boostMaxOffers,
      boost_local_hour: cfg.boostLocalHourStart,
      morning_sustained: cfg.morningSustainedEnabled,
      morning_hour_start: cfg.morningHourStart,
      morning_hour_end_exclusive: cfg.morningHourEndExclusive,
      morning_max_per_run: [cfg.morningMaxPerRunMin, cfg.morningMaxPerRunMax],
      daily_max: cfg.dailyMaxOffers,
      candidate_pool_max: cfg.candidatePoolMax,
      min_discount_percent: cfg.minDiscountPercent,
      auto_approve_enabled: cfg.legacyAutoApproveWriteEnabled,
      auto_approve_policy_enabled: cfg.autoApproveEnabled,
      legacy_auto_approve_write_enabled: cfg.legacyAutoApproveWriteEnabled,
      auto_approve_min_score: cfg.autoApproveMinScore,
      auto_approve_worker_min_score: cfg.autoApproveWorkerMinScore,
      auto_approve_worker_min_discount: cfg.autoApproveWorkerMinDiscountPercent,
      auto_approve_require_image: cfg.autoApproveRequireImage,
      worker_max_per_run: cfg.workerMaxPerRun,
      reject_below_score: cfg.rejectBelowScore,
      category: cfg.category,
      urls_count: cfg.urlsFromEnv.length,
      sample_urls: cfg.urlsFromEnv.slice(0, 8),
      discover_ml: cfg.discoverMlEnabled,
      ml_queries_count: cfg.mlQueries.length,
      ml_categories_count: cfg.mlCategoryIds.length,
      ml_use_default_queries: cfg.mlUseDefaultQueries,
      ml_min_sold: cfg.minSoldQuantityMl,
      ml_fetch_reviews: cfg.mlFetchReviews,
      ml_review_fetch_max: cfg.mlReviewFetchMax,
      min_rating: cfg.minRatingAverage,
      min_rating_reviews: cfg.minRatingReviewsCount,
      tech_categories_count: cfg.techCategoryIds.length,
      amazon_asins_count: cfg.amazonAsins.length,
      amazon_source: cfg.amazonSource,
      amazon_paapi_enabled: cfg.amazonPaapiEnabled,
      keepa_enabled: cfg.keepaEnabled,
      has_ingest_sources: hasIngestSources,
      external_worker_ingest: workerPostsCandidates,
      machine_pending_writes: machinePendingWrites,
    },
    capacity: {
      estimated_inserted_ceiling_per_day: estimatedProcessedPerDay,
      inserted_today_approx: insertedTodayApprox,
      note: 'El tope real lo marca BOT_INGEST_DAILY_MAX y la calidad del pool (skipped/duplicados).',
    },
    offers: {
      pending_count: pendingCount,
      recent: recentOffers,
    },
    env_required: [...TRACKED_ENV_KEYS],
    env_status: envStatus,
    env_missing: missingEnv,
  });
}
