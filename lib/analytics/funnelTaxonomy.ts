/**
 * Canonical product-funnel names.
 * offer_events keeps historical values (view, outbound, share, cazar_cta).
 * product_events stores the canonical names for events that are not offer-scoped
 * and for explicit funnel mirrors.
 */

export const CANONICAL_FUNNEL_EVENTS = [
  'page_view',
  'offer_view',
  'offer_click',
  'outbound_click',
  'vote',
  'save',
  'comment',
  'submission',
  'signup',
  'login',
] as const;

export type CanonicalFunnelEvent = (typeof CANONICAL_FUNNEL_EVENTS)[number];

/** Historical offer_events.event_type → canonical funnel name. */
export const OFFER_EVENT_TO_CANONICAL: Record<string, CanonicalFunnelEvent | undefined> = {
  view: 'offer_view',
  outbound: 'outbound_click',
  cazar_cta: 'offer_click',
};

const CANONICAL_SET = new Set<string>(CANONICAL_FUNNEL_EVENTS);

export function isCanonicalFunnelEvent(value: string): value is CanonicalFunnelEvent {
  return CANONICAL_SET.has(value);
}

/** Strip keys that must never land in analytics metadata. */
const BLOCKED_METADATA_KEYS = new Set([
  'email',
  'phone',
  'password',
  'token',
  'authorization',
  'cookie',
  'ip',
  'clabe',
  'rfc',
]);

export function sanitizeFunnelMetadata(input: unknown): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || BLOCKED_METADATA_KEYS.has(normalized)) continue;
    if (out && Object.keys(out).length >= 12) break;
    if (typeof value === 'string') out[normalized] = value.slice(0, 120);
    else if (typeof value === 'number' && Number.isFinite(value)) out[normalized] = value;
    else if (typeof value === 'boolean') out[normalized] = value;
    else if (value == null) out[normalized] = null;
  }
  return out;
}

export function buildFunnelDedupeKey(input: {
  event: string;
  userId?: string | null;
  anonymousId?: string | null;
  offerId?: string | null;
  bucket: string;
}): string {
  const actor = input.userId || input.anonymousId || 'anon';
  const offer = input.offerId || '-';
  return `${input.event}:${actor}:${offer}:${input.bucket}`.slice(0, 200);
}
