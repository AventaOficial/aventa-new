/**
 * Canonical product-funnel names.
 * offer_events keeps historical values (view, outbound, share, cazar_cta).
 * Names already written in production stay in the allowlist so a CHECK
 * does not reject persisted rows. hunter_intent records opening the
 * canonical composer before any offer exists. It is not a submission.
 * vote, save, comment, signup, offer_view and outbound_click
 * remain names, not write targets: those facts stay in their business tables.
 */

export const CANONICAL_FUNNEL_EVENTS = [
  'page_view',
  'feed_view',
  'search',
  'load_more',
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

/** Events this phase may insert. Mirrors of business tables are not writable. */
export const WRITABLE_PRODUCT_EVENTS = [
  'page_view',
  'feed_view',
  'search',
  'load_more',
  'submission',
  'login',
  'hunter_intent',
] as const;

export type WritableProductEvent = (typeof WRITABLE_PRODUCT_EVENTS)[number];

export const PRODUCT_EVENT_VERSION = 1 as const;

export const PRODUCT_ACTOR_CLASSES = ['HUMAN', 'MACHINE_HUNTER', 'SYSTEM', 'ANONYMOUS'] as const;

export type ProductActorClass = (typeof PRODUCT_ACTOR_CLASSES)[number];

export type CanonicalFunnelEvent = (typeof CANONICAL_FUNNEL_EVENTS)[number];

/** Historical offer_events.event_type → canonical funnel name. */
export const OFFER_EVENT_TO_CANONICAL: Record<string, CanonicalFunnelEvent | undefined> = {
  view: 'offer_view',
  outbound: 'outbound_click',
  cazar_cta: 'offer_click',
};

const CANONICAL_SET = new Set<string>(CANONICAL_FUNNEL_EVENTS);
const WRITABLE_SET = new Set<string>(WRITABLE_PRODUCT_EVENTS);
const ACTOR_SET = new Set<string>(PRODUCT_ACTOR_CLASSES);

export function isCanonicalFunnelEvent(value: string): value is CanonicalFunnelEvent {
  return CANONICAL_SET.has(value);
}

export function isWritableProductEvent(value: string): value is WritableProductEvent {
  return WRITABLE_SET.has(value);
}

export function isProductActorClass(value: string): value is ProductActorClass {
  return ACTOR_SET.has(value);
}

/** Strip keys that must never land in analytics metadata. */
const BLOCKED_METADATA_KEYS = new Set([
  'email',
  'phone',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'bearer',
  'cookie',
  'cookies',
  'ip',
  'ip_hash',
  'secret',
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
