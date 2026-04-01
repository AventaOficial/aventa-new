import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { getBotIngestPausedFromDb } from '@/lib/bots/ingest/botIngestPaused';
import {
  countBotOffersCreatedSince,
  getBotOfferCountStartUtc,
} from '@/lib/bots/ingest/botIngestDailyState';
import { createServerClient } from '@/lib/supabase/server';

/** Objetivo si usas Vercel Pro o cron externo cada 15 min (no aplica en Hobby sin cron). */
const CRON_SCHEDULE = '*/15 * * * *';
const RUNS_PER_DAY_ESTIMATE = 96;
const CRON_DEPLOYMENT_NOTE =
  'En Vercel Hobby no puede haber cron del bot en vercel.json (máx. 1×/día). Para automatizar cada ~15 min: plan Pro y añade el job en vercel.json, o un servicio externo (GET con CRON_SECRET), o «Ejecutar ahora» en Trabajo.';

const TRACKED_ENV_KEYS = [
  'BOT_INGEST_ENABLED',
  'BOT_INGEST_USER_ID',
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
  'BOT_INGEST_REJECT_BELOW_SCORE',
  'BOT_INGEST_CATEGORY',
] as const;

function hasEnvValue(key: string): boolean {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Estado operativo del bot de ingesta para owner/admin. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = loadBotIngestConfig();
  const pausedByOwner = await getBotIngestPausedFromDb();

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

  if (cfg.botUserId) {
    const supabase = createServerClient();
    const { data: offers } = await supabase
      .from('offers')
      .select('id, title, status, created_at, store, price')
      .eq('created_by', cfg.botUserId)
      .order('created_at', { ascending: false })
      .limit(12);
    recentOffers = (offers ?? []) as typeof recentOffers;

    const { count } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', cfg.botUserId)
      .eq('status', 'pending');
    pendingCount = count ?? null;

    const start = getBotOfferCountStartUtc(cfg.timezone);
    insertedTodayApprox = await countBotOffersCreatedSince(cfg.botUserId, start);
  }

  const envStatus = Object.fromEntries(
    TRACKED_ENV_KEYS.map((k) => [k, hasEnvValue(k)])
  ) as Record<(typeof TRACKED_ENV_KEYS)[number], boolean>;

  const hasIngestSources =
    cfg.urlsFromEnv.length > 0 ||
    cfg.amazonAsins.length > 0 ||
    (cfg.discoverMlEnabled &&
      (cfg.mlQueries.length > 0 || cfg.mlCategoryIds.length > 0 || cfg.mlUseDefaultQueries));

  const missingEnv: string[] = TRACKED_ENV_KEYS.filter((key) => !envStatus[key]);
  if (cfg.enabled && !hasIngestSources) {
    missingEnv.push(
      'BOT_INGEST_fuentes: URLS o BOT_INGEST_DISCOVER_ML (queries/categorías o defaults) o BOT_INGEST_AMAZON_ASINS'
    );
  }

  const avgNormal = (cfg.normalMaxPerRunMin + cfg.normalMaxPerRunMax) / 2;
  const estimatedProcessedPerDay = Math.min(
    cfg.dailyMaxOffers,
    Math.round(avgNormal * RUNS_PER_DAY_ESTIMATE + cfg.boostMaxOffers)
  );

  return NextResponse.json({
    enabled: cfg.enabled && !pausedByOwner,
    env_ingest_enabled: cfg.enabled,
    paused_by_owner: pausedByOwner,
    cron: {
      path: '/api/cron/bot-ingest',
      schedule: CRON_SCHEDULE,
      runs_per_day_estimate: RUNS_PER_DAY_ESTIMATE,
      deployment_note: CRON_DEPLOYMENT_NOTE,
    },
    config: {
      bot_user_id_configured: Boolean(cfg.botUserId),
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
      auto_approve_enabled: cfg.autoApproveEnabled,
      auto_approve_min_score: cfg.autoApproveMinScore,
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
