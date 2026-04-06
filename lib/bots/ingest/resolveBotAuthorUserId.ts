import type { BotIngestConfig } from './config';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';

/**
 * Elige `created_by` para una oferta del bot.
 * Modo dual (BOT_INGEST_USER_ID_TECH + BOT_INGEST_USER_ID_STAPLES):
 * categoría ML en `BOT_INGEST_ML_TECH_CATEGORY_IDS` → usuario tech; si no → usuario staples.
 * Sin modo dual: siempre `BOT_INGEST_USER_ID`.
 */
export function resolveBotAuthorUserId(
  config: BotIngestConfig,
  meta: ParsedOfferMetadata
): string | null {
  if (config.botAuthorDualMode && config.botUserIdTech && config.botUserIdStaples) {
    const cat = meta.signals?.categoryId?.trim() ?? null;
    if (cat && config.techCategoryIdSet.has(cat)) {
      return config.botUserIdTech;
    }
    return config.botUserIdStaples;
  }
  return config.botUserId;
}
