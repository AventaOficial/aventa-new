import { normalizeCategoryForStorage } from '@/lib/categories';

/** Consultas por defecto (sitio MLM) si activas descubrimiento ML sin listas propias. */
export const DEFAULT_ML_DISCOVERY_QUERIES = [
  'laptop',
  'audifonos bluetooth',
  'tablet',
  'smartwatch',
  'televisor smart',
  'freidora de aire',
  'ssd nvme',
  'mouse inalambrico',
  'teclado mecanico',
  'nintendo switch juego',
  'monitor 27 pulgadas',
] as const;

/** Categorías MLM típicas de tecnología / gaming (sobrescribibles por env). */
export const DEFAULT_ML_TECH_CATEGORY_IDS = [
  'MLM1648',
  'MLM1000',
  'MLM1144',
  'MLM1574',
] as const;

export type BotIngestScoreWeights = {
  discount: number;
  popularity: number;
  rating: number;
  category: number;
  priceAppeal: number;
};

export type BotIngestConfig = {
  enabled: boolean;
  botUserId: string | null;
  /** Zona horaria para boost 7:00 y tope diario. */
  timezone: string;
  /** Corrida normal: aleatorio entre min y max (inclusive). */
  normalMaxPerRunMin: number;
  normalMaxPerRunMax: number;
  /** Máximo en ventana boost matutina (una corrida fuerte al día, hora local). */
  boostMaxOffers: number;
  boostLocalHourStart: number;
  boostLocalMinuteEnd: number;
  /**
   * Si true: en [morningHourStart, morningHourEndExclusive) cada cron usa morningMaxPerRun* (sin gastar el “boost” de un solo disparo).
   * Objetivo típico: muchas inserciones entre ~5:00 y ~10:59 hora local.
   */
  morningSustainedEnabled: boolean;
  morningHourStart: number;
  morningHourEndExclusive: number;
  morningMaxPerRunMin: number;
  morningMaxPerRunMax: number;
  /** Tope de ofertas insertadas por día (usuario bot), según inicio de día local. */
  dailyMaxOffers: number;
  /** Máximo de candidatos a evaluar (fetch HTML / score) por corrida. */
  candidatePoolMax: number;

  maxPerRun: number;
  minDiscountPercent: number;
  category: string | null;
  urlsFromEnv: string[];

  discoverMlEnabled: boolean;
  mlQueries: string[];
  mlCategoryIds: string[];
  mlUseDefaultQueries: boolean;
  mlSearchLimitPerRequest: number;
  mlMaxCollect: number;
  /** Orden en búsqueda ML: sold_quantity_desc | relevance */
  mlSortTrending: string;
  /** Categorías “tech” para rotación y scoring. */
  techCategoryIds: string[];
  techCategoryIdSet: Set<string>;

  amazonAsins: string[];
  amazonDpBase: string;

  minSoldQuantityMl: number;
  minRatingAverage: number;
  minRatingReviewsCount: number;
  mlFetchReviews: boolean;
  mlReviewFetchMax: number;

  /** Si false, nunca status approved por score; todo pasa a moderación (pending). */
  autoApproveEnabled: boolean;
  autoApproveMinScore: number;
  rejectBelowScore: number;
  scoreWeights: BotIngestScoreWeights;

  titleBlocklistGenericRe: RegExp | null;
  titleBlocklistSpamRe: RegExp | null;
};

/** Expone lista de URLs (tests y depuración). */
export function parseBotIngestUrlList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const lines = raw.split(/[\n,]+/);
  const out: string[] = [];
  for (const line of lines) {
    const u = line.trim();
    if (!u || u.startsWith('#')) continue;
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        out.push(parsed.href);
      }
    } catch {
      /* ignorar token inválido */
    }
  }
  return out;
}

/** Tokens separados por coma o salto de línea (# = comentario de línea). */
export function parseCommaNewlineTokens(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  for (const line of raw.split(/[\n,]+/)) {
    const t = line.trim();
    if (t && !t.startsWith('#')) out.push(t);
  }
  return out;
}

/** ASIN Amazon (B + 9 alfanuméricos). Acepta líneas con ruido; deduplica. */
export function parseAmazonAsinList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/[\n,]+/)) {
    const t = line.trim().toUpperCase();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/\b(B[0-9A-Z]{9})\b/);
    if (!m) continue;
    const asin = m[1];
    if (seen.has(asin)) continue;
    seen.add(asin);
    out.push(asin);
  }
  return out;
}

function parseScoreWeights(raw: string | undefined): BotIngestScoreWeights {
  const def: BotIngestScoreWeights = {
    discount: 0.28,
    popularity: 0.22,
    rating: 0.2,
    category: 0.15,
    priceAppeal: 0.15,
  };
  if (!raw?.trim()) return def;
  const parts = raw.split(',').map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return def;
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return def;
  return {
    discount: parts[0] / sum,
    popularity: parts[1] / sum,
    rating: parts[2] / sum,
    category: parts[3] / sum,
    priceAppeal: parts[4] / sum,
  };
}

function safeRegExp(pattern: string | undefined, fallback: RegExp | null): RegExp | null {
  if (!pattern?.trim()) return fallback;
  try {
    return new RegExp(pattern.trim(), 'i');
  } catch {
    return fallback;
  }
}

export function loadBotIngestConfig(): BotIngestConfig {
  const enabled = process.env.BOT_INGEST_ENABLED === 'true' || process.env.BOT_INGEST_ENABLED === '1';
  const botUserId = process.env.BOT_INGEST_USER_ID?.trim() || null;

  const timezone = process.env.BOT_INGEST_TIMEZONE?.trim() || 'America/Mexico_City';

  const normalMin = Math.min(
    10,
    Math.max(1, Number.parseInt(process.env.BOT_INGEST_NORMAL_MAX_MIN ?? '1', 10) || 1)
  );
  const normalMax = Math.min(
    10,
    Math.max(normalMin, Number.parseInt(process.env.BOT_INGEST_NORMAL_MAX_MAX ?? '3', 10) || 3)
  );

  const boostMax = Math.min(
    80,
    Math.max(5, Number.parseInt(process.env.BOT_INGEST_BOOST_MAX ?? '20', 10) || 20)
  );
  const boostHour = Math.min(23, Math.max(0, Number.parseInt(process.env.BOT_INGEST_BOOST_LOCAL_HOUR ?? '7', 10) || 7));
  const boostEndMin = Math.min(
    59,
    Math.max(0, Number.parseInt(process.env.BOT_INGEST_BOOST_LOCAL_MINUTE_END ?? '30', 10) || 30)
  );

  const morningSustainedEnabled =
    process.env.BOT_INGEST_MORNING_SUSTAINED === '1' ||
    process.env.BOT_INGEST_MORNING_SUSTAINED === 'true';
  const morningStart = Math.min(
    23,
    Math.max(0, Number.parseInt(process.env.BOT_INGEST_MORNING_HOUR_START ?? '5', 10) || 5)
  );
  const morningEndExcl = Math.min(
    24,
    Math.max(
      morningStart + 1,
      Number.parseInt(process.env.BOT_INGEST_MORNING_HOUR_END_EXCLUSIVE ?? '11', 10) || 11
    )
  );
  const morningMin = Math.min(
    10,
    Math.max(1, Number.parseInt(process.env.BOT_INGEST_MORNING_MAX_MIN ?? '2', 10) || 2)
  );
  const morningMax = Math.min(
    15,
    Math.max(morningMin, Number.parseInt(process.env.BOT_INGEST_MORNING_MAX_MAX ?? '5', 10) || 5)
  );

  const dailyMax = Math.min(
    500,
    Math.max(10, Number.parseInt(process.env.BOT_INGEST_DAILY_MAX ?? '120', 10) || 120)
  );
  const candidatePoolMax = Math.min(
    200,
    Math.max(8, Number.parseInt(process.env.BOT_INGEST_CANDIDATE_POOL_MAX ?? '48', 10) || 48)
  );

  const maxPerRun = Math.min(
    100,
    Math.max(1, Number.parseInt(process.env.BOT_INGEST_MAX_PER_RUN ?? '5', 10) || 5)
  );

  const minRaw = Number.parseInt(process.env.BOT_INGEST_MIN_DISCOUNT_PERCENT ?? '20', 10);
  const minDiscountPercent = Number.isFinite(minRaw) ? Math.min(100, Math.max(0, minRaw)) : 20;

  const catRaw = process.env.BOT_INGEST_CATEGORY?.trim();
  const category = catRaw ? normalizeCategoryForStorage(catRaw) : null;
  const urlsFromEnv = parseBotIngestUrlList(process.env.BOT_INGEST_URLS);

  const discoverMlEnabled =
    process.env.BOT_INGEST_DISCOVER_ML === 'true' || process.env.BOT_INGEST_DISCOVER_ML === '1';
  const mlQueries = parseCommaNewlineTokens(process.env.BOT_INGEST_ML_QUERIES);
  const mlCategoryIds = parseCommaNewlineTokens(process.env.BOT_INGEST_ML_CATEGORY_IDS);
  const mlUseDefaultQueries =
    process.env.BOT_INGEST_ML_USE_DEFAULT_QUERIES !== '0' &&
    process.env.BOT_INGEST_ML_USE_DEFAULT_QUERIES !== 'false';

  const mlLimitRaw = Number.parseInt(process.env.BOT_INGEST_ML_SEARCH_LIMIT ?? '50', 10);
  const mlSearchLimitPerRequest = Number.isFinite(mlLimitRaw)
    ? Math.min(50, Math.max(1, mlLimitRaw))
    : 50;

  const mlMaxRaw = Number.parseInt(process.env.BOT_INGEST_ML_MAX_COLLECT ?? '', 10);
  const mlMaxCollect = Number.isFinite(mlMaxRaw)
    ? Math.min(500, Math.max(mlSearchLimitPerRequest, mlMaxRaw))
    : Math.min(500, Math.max(mlSearchLimitPerRequest * 5, 80));

  const mlSortTrending = process.env.BOT_INGEST_ML_SORT_TRENDING?.trim() || 'sold_quantity_desc';

  const techFromEnv = parseCommaNewlineTokens(process.env.BOT_INGEST_ML_TECH_CATEGORY_IDS);
  const techCategoryIds =
    techFromEnv.length > 0 ? techFromEnv : [...DEFAULT_ML_TECH_CATEGORY_IDS];

  const amazonAsins = parseAmazonAsinList(process.env.BOT_INGEST_AMAZON_ASINS);
  let amazonDpBase =
    process.env.BOT_INGEST_AMAZON_DP_BASE?.trim() || 'https://www.amazon.com.mx/dp/';
  if (!amazonDpBase.endsWith('/')) amazonDpBase += '/';

  const minSold = Number.parseInt(process.env.BOT_INGEST_ML_MIN_SOLD ?? '50', 10);
  const minSoldQuantityMl = Number.isFinite(minSold) ? Math.max(0, minSold) : 50;

  const minRating = Number.parseFloat(process.env.BOT_INGEST_MIN_RATING ?? '4');
  const minRatingAverage = Number.isFinite(minRating) ? Math.min(5, Math.max(0, minRating)) : 4;

  const minRev = Number.parseInt(process.env.BOT_INGEST_MIN_RATING_REVIEWS ?? '5', 10);
  const minRatingReviewsCount = Number.isFinite(minRev) ? Math.max(1, minRev) : 5;

  const mlFetchReviews =
    process.env.BOT_INGEST_ML_FETCH_REVIEWS === '1' ||
    process.env.BOT_INGEST_ML_FETCH_REVIEWS === 'true';

  const revMaxRaw = Number.parseInt(process.env.BOT_INGEST_ML_REVIEW_FETCH_MAX ?? '18', 10);
  const mlReviewFetchMax = Number.isFinite(revMaxRaw) ? Math.min(40, Math.max(0, revMaxRaw)) : 18;

  const autoApproveEnabled =
    process.env.BOT_INGEST_AUTO_APPROVE !== '0' &&
    process.env.BOT_INGEST_AUTO_APPROVE !== 'false';

  const autoApproveRaw = Number.parseInt(process.env.BOT_INGEST_AUTO_APPROVE_MIN_SCORE ?? '78', 10);
  const autoApproveMinScore = Number.isFinite(autoApproveRaw)
    ? Math.min(100, Math.max(50, autoApproveRaw))
    : 78;

  const rejectRaw = Number.parseInt(process.env.BOT_INGEST_REJECT_BELOW_SCORE ?? '42', 10);
  const rejectBelowScore = Number.isFinite(rejectRaw)
    ? Math.min(autoApproveMinScore - 1, Math.max(0, rejectRaw))
    : 42;

  const scoreWeights = parseScoreWeights(process.env.BOT_INGEST_SCORE_WEIGHTS);

  const titleBlocklistGenericRe = safeRegExp(
    process.env.BOT_INGEST_TITLE_RE_GENERIC?.trim(),
    null
  );
  const titleBlocklistSpamRe = safeRegExp(process.env.BOT_INGEST_TITLE_RE_SPAM?.trim(), null);

  return {
    enabled,
    botUserId,
    timezone,
    normalMaxPerRunMin: normalMin,
    normalMaxPerRunMax: normalMax,
    boostMaxOffers: boostMax,
    boostLocalHourStart: boostHour,
    boostLocalMinuteEnd: boostEndMin,
    morningSustainedEnabled,
    morningHourStart: morningStart,
    morningHourEndExclusive: morningEndExcl,
    morningMaxPerRunMin: morningMin,
    morningMaxPerRunMax: morningMax,
    dailyMaxOffers: dailyMax,
    candidatePoolMax,
    maxPerRun,
    minDiscountPercent,
    category,
    urlsFromEnv,
    discoverMlEnabled,
    mlQueries,
    mlCategoryIds,
    mlUseDefaultQueries,
    mlSearchLimitPerRequest,
    mlMaxCollect,
    mlSortTrending,
    techCategoryIds,
    techCategoryIdSet: new Set(techCategoryIds),
    amazonAsins,
    amazonDpBase,
    minSoldQuantityMl,
    minRatingAverage,
    minRatingReviewsCount,
    mlFetchReviews,
    mlReviewFetchMax,
    autoApproveEnabled,
    autoApproveMinScore,
    rejectBelowScore,
    scoreWeights,
    titleBlocklistGenericRe,
    titleBlocklistSpamRe,
  };
}
