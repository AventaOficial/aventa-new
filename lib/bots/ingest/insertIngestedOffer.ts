import { createServerClient } from '@/lib/supabase/server';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import { normalizeCategoryForStorage, isValidCategoryId } from '@/lib/categories';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { BotIngestConfig } from './config';
import type { ScoreBreakdown, ScoreDecision } from './scoreIngestCandidate';
import { resolveBotAuthorUserId } from './resolveBotAuthorUserId';
import { classifyBotCategoryForStorage } from './classifyBotCategory';
import { buildBotOfferDescription } from './buildBotOfferDescription';
import { buildBotMeta } from './buildBotMeta';
import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';

/** Columnas opcionales: si el esquema aún no las tiene, el insert se reintenta sin ellas. */
const OPTIONAL_COLUMNS = ['bot_meta', 'link_mod_ok', 'moderator_comment'] as const;

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export type InsertIngestOptions = {
  status: 'pending' | 'approved';
  titleOverride?: string;
  ingestScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  moderatorNote?: string;
  ingestSource?: string;
  ingestSourceDetail?: string;
  decision?: ScoreDecision;
};

export type InsertIngestResult =
  | { ok: true; offerId: string }
  | { ok: false; duplicate: true }
  | { ok: false; error: string };

function buildModeratorComment(opts: InsertIngestOptions | undefined): string {
  if (opts?.ingestScore == null) {
    return `[bot-ingest] Creado por cron de ingesta; revisar precio y enlace.${opts?.moderatorNote ? ` ${opts.moderatorNote}` : ''}`;
  }
  const mode = opts.status === 'approved' ? 'auto-aprobada' : 'moderación';
  const b = opts.scoreBreakdown;
  const parts = b
    ? `d${b.discount} p${b.popularity} r${b.rating} c${b.category} $${b.priceAppeal}`
    : '';
  return `[bot-ingest v3] score=${opts.ingestScore} (${mode})${parts ? ` | ${parts}` : ''}${opts.moderatorNote ? ` | ${opts.moderatorNote}` : ''}`;
}

export async function insertIngestedOffer(
  meta: ParsedOfferMetadata,
  config: BotIngestConfig,
  opts?: InsertIngestOptions
): Promise<InsertIngestResult> {
  const authorId = resolveBotAuthorUserId(config, meta);
  if (!authorId) {
    return {
      ok: false,
      error:
        'Configura BOT_INGEST_USER_ID o el par BOT_INGEST_USER_ID_TECH + BOT_INGEST_USER_ID_STAPLES',
    };
  }

  const offerUrl = await resolveAndNormalizeAffiliateOfferUrl(meta.canonicalUrl);
  const supabase = createServerClient();

  const { findDuplicateOfferByUrl } = await import('@/lib/offers/findDuplicateOffer');
  const duplicate = await findDuplicateOfferByUrl(supabase, offerUrl);
  if (duplicate) {
    return { ok: false, duplicate: true };
  }

  const categoryFromEnv =
    config.category && config.category.trim()
      ? normalizeCategoryForStorage(config.category.trim())
      : null;
  const categoryInferred = classifyBotCategoryForStorage(meta, config.techCategoryIdSet);
  const categoryBase = categoryFromEnv ?? categoryInferred;
  const hasOriginal = meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  const status = opts?.status ?? 'pending';
  const title = (opts?.titleOverride ?? meta.title).slice(0, 500);
  const description = buildBotOfferDescription(meta, categoryBase).slice(0, 2000);
  const autogroup = inferOfferAutogroup({
    title,
    store: meta.store,
    category: categoryBase,
    description,
  });
  const category = autogroup.category ?? categoryBase;
  const tags = autogroup.tags;
  const imageNormalized = normalizeOfferImageUrl(meta.imageUrl) ?? '';

  const expiresAt =
    status === 'approved' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  const catNote = category ? ` cat=${category}` : '';
  const moderatorComment = buildModeratorComment({
    status,
    titleOverride: opts?.titleOverride,
    ingestScore: opts?.ingestScore,
    scoreBreakdown: opts?.scoreBreakdown,
    moderatorNote: `${opts?.moderatorNote ?? ''}${catNote}`.trim() || undefined,
  });

  const botMeta = buildBotMeta({
    meta,
    scoreBreakdown: opts?.scoreBreakdown,
    ingestSource: opts?.ingestSource,
    ingestSourceDetail: opts?.ingestSourceDetail,
    decision: opts?.decision,
  });

  const payload: Record<string, unknown> = {
    title,
    price: meta.discountPrice,
    original_price: hasOriginal ? meta.originalPrice : null,
    store: meta.store.slice(0, 200),
    ...(category ? { category } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    status,
    created_by: authorId,
    image_url: imageNormalized.slice(0, 2048),
    offer_url: offerUrl,
    description,
    moderator_comment: moderatorComment,
    ...(botMeta ? { bot_meta: botMeta } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(status === 'approved' ? { link_mod_ok: true } : {}),
  };

  const attempt: Record<string, unknown> = { ...payload };
  let { data, error } = await supabase.from('offers').insert([attempt]).select('id').single();

  for (let retry = 0; error && retry < OPTIONAL_COLUMNS.length; retry += 1) {
    const missing = OPTIONAL_COLUMNS.find(
      (column) => column in attempt && hasMissingColumn(error, column)
    );
    if (!missing) break;
    delete attempt[missing];
    ({ data, error } = await supabase.from('offers').insert([attempt]).select('id').single());
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  const id = (data as { id?: string })?.id;
  if (!id) {
    return { ok: false, error: 'Sin id tras insert' };
  }

  return { ok: true, offerId: id };
}
