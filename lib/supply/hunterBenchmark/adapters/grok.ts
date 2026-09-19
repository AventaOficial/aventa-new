import type { HunterCollectContext, HunterSource } from '../types';

/**
 * Stub adapter for Grok hunter exports.
 * Aventa only consumes normalized HunterResult — never Grok runtime.
 */
export const GROK_HUNTER_ID = 'grok';

export function createGrokHunterSource(
  fetchPayload: (ctx: HunterCollectContext) => Promise<unknown>,
): HunterSource {
  return {
    id: GROK_HUNTER_ID,
    displayName: 'Grok Hunter',
    kind: 'external_llm',
    collect: fetchPayload,
  };
}

/** Example payload shape accepted by normalizeHunterResult. */
export function grokSamplePayload() {
  return {
    ok: true,
    deals: [
      {
        link: 'https://www.amazon.com.mx/dp/B0EXAMPLE',
        name: 'Echo Dot',
        asin: 'B0EXAMPLE',
        prices: {
          current: { amount: 799, currency: 'MXN', provenance: 'source_explicit' },
          original: { amount: 1299, currency: 'MXN', provenance: 'source_explicit' },
        },
        foundAt: '2026-09-18T12:05:00.000Z',
      },
    ],
  };
}
