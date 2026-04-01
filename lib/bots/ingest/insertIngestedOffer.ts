import { createServerClient } from '@/lib/supabase/server';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { BotIngestConfig } from './config';
import type { ScoreBreakdown } from './scoreIngestCandidate';

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
  const botUserId = config.botUserId;
  if (!botUserId) {
    return { ok: false, error: 'BOT_INGEST_USER_ID no configurado' };
  }

  const offerUrl = await resolveAndNormalizeAffiliateOfferUrl(meta.canonicalUrl);
  const supabase = createServerClient();

  const { data: existing } = await supabase.from('offers').select('id').eq('offer_url', offerUrl).maybeSingle();
  if (existing?.id) {
    return { ok: false, duplicate: true };
  }

  const category = config.category && config.category.trim() ? config.category.trim() : null;
  const hasOriginal = meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  const status = opts?.status ?? 'pending';
  const title = (opts?.titleOverride ?? meta.title).slice(0, 500);

  const expiresAt =
    status === 'approved' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  const payload: Record<string, unknown> = {
    title,
    price: meta.discountPrice,
    original_price: hasOriginal ? meta.originalPrice : null,
    store: meta.store.slice(0, 200),
    ...(category ? { category } : {}),
    status,
    created_by: botUserId,
    image_url: meta.imageUrl.slice(0, 2048),
    offer_url: offerUrl,
    description: `Ingesta automática (bot). Origen: ${new URL(meta.canonicalUrl).hostname}`,
    moderator_comment: buildModeratorComment(opts),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(status === 'approved' ? { link_mod_ok: true } : {}),
  };

  let { data, error } = await supabase.from('offers').insert([payload]).select('id').single();

  if (error && hasMissingColumn(error, 'link_mod_ok')) {
    const fallback = { ...payload };
    delete fallback.link_mod_ok;
    ({ data, error } = await supabase.from('offers').insert([fallback]).select('id').single());
  }

  if (error && hasMissingColumn(error, 'moderator_comment')) {
    const fallback = { ...payload };
    delete fallback.moderator_comment;
    delete fallback.link_mod_ok;
    ({ data, error } = await supabase.from('offers').insert([fallback]).select('id').single());
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
