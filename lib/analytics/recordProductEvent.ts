import { createServerClient } from '@/lib/supabase/server';
import {
  buildFunnelDedupeKey,
  isCanonicalFunnelEvent,
  sanitizeFunnelMetadata,
  type CanonicalFunnelEvent,
} from '@/lib/analytics/funnelTaxonomy';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

export async function recordProductEvent(input: {
  event: CanonicalFunnelEvent;
  userId?: string | null;
  anonymousId?: string | null;
  offerId?: string | null;
  source?: string | null;
  metadata?: unknown;
  dedupe?: boolean;
}): Promise<{ ok: boolean }> {
  if (!isCanonicalFunnelEvent(input.event)) return { ok: false };
  try {
    const supabase = createServerClient();
    const hourBucket = new Date().toISOString().slice(0, 13);
    const dedupeKey = input.dedupe === false
      ? null
      : buildFunnelDedupeKey({
          event: input.event,
          userId: input.userId,
          anonymousId: input.anonymousId,
          offerId: input.offerId,
          bucket: hourBucket,
        });

    const { error } = await supabase.from('product_events').insert({
      event_name: input.event,
      user_id: input.userId ?? null,
      anonymous_id: input.anonymousId ? input.anonymousId.slice(0, 80) : null,
      offer_id: input.offerId ?? null,
      source: input.source ? input.source.slice(0, 64) : null,
      metadata: sanitizeFunnelMetadata(input.metadata),
      dedupe_key: dedupeKey,
    });

    if (error) {
      if (error.code === '23505') return { ok: true };
      return { ok: false };
    }
    incrementLaunchMetric('analytics_events');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
