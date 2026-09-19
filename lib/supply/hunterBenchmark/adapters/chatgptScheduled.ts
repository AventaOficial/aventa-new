import type { HunterCollectContext, HunterSource } from '../types';

/**
 * Stub adapter for ChatGPT scheduled hunter exports.
 * Aventa only consumes normalized HunterResult — never ChatGPT runtime.
 */
export const CHATGPT_SCHEDULED_HUNTER_ID = 'chatgpt_scheduled';

export function createChatGptScheduledHunterSource(
  fetchPayload: (ctx: HunterCollectContext) => Promise<unknown>,
): HunterSource {
  return {
    id: CHATGPT_SCHEDULED_HUNTER_ID,
    displayName: 'ChatGPT Scheduled Hunter',
    kind: 'external_llm',
    collect: fetchPayload,
  };
}

/** Example payload shape accepted by normalizeHunterResult. */
export function chatGptScheduledSamplePayload() {
  return {
    ok: true,
    candidates: [
      {
        url: 'https://www.mercadolibre.com.mx/producto-ejemplo/p/MLM123',
        title: 'Producto ejemplo',
        price: { amount: 999, currency: 'MXN', provenance: 'source_explicit' },
        originalPrice: { amount: 1499, currency: 'MXN', provenance: 'listing_card' },
        discoveredAt: '2026-09-18T12:00:00.000Z',
      },
    ],
  };
}
