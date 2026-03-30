import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { createServerClient } from '@/lib/supabase/server';

const CRON_SCHEDULE = '0 */6 * * *';
const RUNS_PER_DAY = 4;
const REQUIRED_ENV_KEYS = [
  'BOT_INGEST_ENABLED',
  'BOT_INGEST_USER_ID',
  'BOT_INGEST_URLS',
  'BOT_INGEST_MAX_PER_RUN',
  'BOT_INGEST_MIN_DISCOUNT_PERCENT',
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
  const estimatedProcessedPerDay = cfg.maxPerRun * RUNS_PER_DAY;
  let recentOffers: Array<{
    id: string;
    title: string;
    status: string;
    created_at: string;
    store: string | null;
    price: number;
  }> = [];
  let pendingCount: number | null = null;

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
  }

  const envStatus = Object.fromEntries(
    REQUIRED_ENV_KEYS.map((k) => [k, hasEnvValue(k)])
  ) as Record<(typeof REQUIRED_ENV_KEYS)[number], boolean>;
  const missingEnv = REQUIRED_ENV_KEYS.filter((k) => !envStatus[k]);

  return NextResponse.json({
    enabled: cfg.enabled,
    cron: {
      path: '/api/cron/bot-ingest',
      schedule: CRON_SCHEDULE,
      runs_per_day: RUNS_PER_DAY,
    },
    config: {
      bot_user_id_configured: Boolean(cfg.botUserId),
      max_per_run: cfg.maxPerRun,
      min_discount_percent: cfg.minDiscountPercent,
      category: cfg.category,
      urls_count: cfg.urlsFromEnv.length,
      sample_urls: cfg.urlsFromEnv.slice(0, 8),
    },
    capacity: {
      estimated_processed_per_day: estimatedProcessedPerDay,
      note: 'Procesadas != insertadas (puede haber duplicadas/skipped/error).',
    },
    offers: {
      pending_count: pendingCount,
      recent: recentOffers,
    },
    env_required: REQUIRED_ENV_KEYS,
    env_status: envStatus,
    env_missing: missingEnv,
  });
}
