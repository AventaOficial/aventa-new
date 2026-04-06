import { describe, it, expect } from 'vitest';
import { resolveBotAuthorUserId } from '@/lib/bots/ingest/resolveBotAuthorUserId';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://www.mercadolibre.com.mx/x',
    title: 'x',
    store: 'Mercado Libre',
    imageUrl: 'https://x',
    discountPrice: 100,
    originalPrice: 200,
    discountPercent: 50,
    ...over,
  };
}

describe('resolveBotAuthorUserId', () => {
  it('modo simple: siempre BOT_INGEST_USER_ID', () => {
    const cfg = {
      botUserId: 'u-main',
      botUserIdTech: null,
      botUserIdStaples: null,
      botAuthorDualMode: false,
      techCategoryIdSet: new Set(['MLM1648']),
    } as Pick<
      BotIngestConfig,
      'botUserId' | 'botUserIdTech' | 'botUserIdStaples' | 'botAuthorDualMode' | 'techCategoryIdSet'
    > as BotIngestConfig;

    expect(resolveBotAuthorUserId(cfg, meta({ signals: { categoryId: 'MLM1648' } }))).toBe('u-main');
  });

  it('modo dual: tech si categoría en set; si no, staples', () => {
    const cfg = {
      botUserId: null,
      botUserIdTech: 'u-tech',
      botUserIdStaples: 'u-staples',
      botAuthorDualMode: true,
      techCategoryIdSet: new Set(['MLM1648']),
    } as Pick<
      BotIngestConfig,
      'botUserId' | 'botUserIdTech' | 'botUserIdStaples' | 'botAuthorDualMode' | 'techCategoryIdSet'
    > as BotIngestConfig;

    expect(resolveBotAuthorUserId(cfg, meta({ signals: { categoryId: 'MLM1648' } }))).toBe('u-tech');
    expect(resolveBotAuthorUserId(cfg, meta({ signals: { categoryId: 'MLM1574' } }))).toBe('u-staples');
    expect(resolveBotAuthorUserId(cfg, meta({ signals: {} }))).toBe('u-staples');
  });
});
