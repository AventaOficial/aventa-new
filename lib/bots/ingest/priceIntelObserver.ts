/**
 * Day 13.2 — Price Intelligence observer hooks (OBSERVABILITY ONLY).
 *
 * Callbacks are notified by existing PI / Price Memory code paths without
 * changing their inputs, outputs, keys or writes. Observer failures are
 * swallowed so instrumentation can never alter the observed flow.
 */

export type PriceIntelEvidenceKind = 'live' | 'fallback' | 'unknown';

/** Only kinds the calling code knows explicitly; never derived from ID shape. */
export type PriceIntelExplicitKind = 'product' | 'listing' | 'unknown';

export type PriceIntelWriter = 'sticky_observe' | 'enrich_with_price_intel';

export type PriceIntelQuoteEvent = {
  id: string;
  evidenceKind: PriceIntelEvidenceKind;
};

export type PriceMemoryWriteAttemptEvent = {
  key: string;
  keyKind: PriceIntelExplicitKind;
  writer: PriceIntelWriter;
  evidenceKind: PriceIntelEvidenceKind;
  observedListingId: string | null;
};

export type PriceIntelComputedEvent = {
  id: string;
  kind: PriceIntelExplicitKind;
  writer: PriceIntelWriter;
  evidenceKind: PriceIntelEvidenceKind;
  observedListingId: string | null;
};

export type PriceIntelObserver = {
  onQuoteEvidence?: (event: PriceIntelQuoteEvent) => void;
  onPriceMemoryWriteAttempt?: (event: PriceMemoryWriteAttemptEvent) => void;
  onPriceIntelComputed?: (event: PriceIntelComputedEvent) => void;
};

export function notifyPriceIntelObserver<K extends keyof PriceIntelObserver>(
  observer: PriceIntelObserver | null | undefined,
  hook: K,
  event: Parameters<NonNullable<PriceIntelObserver[K]>>[0],
): void {
  const fn = observer?.[hook] as ((e: typeof event) => void) | undefined;
  if (!fn) return;
  try {
    fn(event);
  } catch {
    /* observability must never alter the observed flow */
  }
}
