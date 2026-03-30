import { createServerClient } from '@/lib/supabase/server';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { BotIngestConfig } from './config';

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export type InsertIngestResult =
  | { ok: true; offerId: string }
  | { ok: false; duplicate: true }
  | { ok: false; error: string };

export async function insertIngestedOffer(
  meta: ParsedOfferMetadata,
  config: BotIngestConfig
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

  const payload: Record<string, unknown> = {
    title: meta.title.slice(0, 500),
    price: meta.discountPrice,
    original_price: hasOriginal ? meta.originalPrice : null,
    store: meta.store.slice(0, 200),
    ...(category ? { category } : {}),
    status: 'pending',
    created_by: botUserId,
    image_url: meta.imageUrl.slice(0, 2048),
    offer_url: offerUrl,
    description: `Ingesta automática (bot). Origen: ${new URL(meta.canonicalUrl).hostname}`,
    moderator_comment: '[bot-ingest] Creado por cron de ingesta; revisar precio y enlace.',
  };

  let { data, error } = await supabase.from('offers').insert([payload]).select('id').single();

  if (error && hasMissingColumn(error, 'moderator_comment')) {
    const fallback = { ...payload };
    delete fallback.moderator_comment;
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
