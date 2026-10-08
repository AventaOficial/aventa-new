import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { resolveProductActorClass } from '@/lib/analytics/productActorClass';
import {
  isPhase1BehaviorEvent,
  phase1DedupeKey,
  productActorKey,
} from '@/lib/analytics/productEventContract';
import {
  buildFunnelDedupeKey,
  isWritableProductEvent,
  PRODUCT_ACTOR_CLASSES,
  PRODUCT_EVENT_VERSION,
  sanitizeFunnelMetadata,
  WRITABLE_PRODUCT_EVENTS,
  type WritableProductEvent,
} from '@/lib/analytics/funnelTaxonomy';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

function observeFailure(reason: string): void {
  console.error('[product-event] write failed', reason);
  incrementLaunchMetric('analytics_write_failed');
}

const productEventRowSchema = z.object({
  event_name: z.enum(WRITABLE_PRODUCT_EVENTS),
  event_version: z.literal(PRODUCT_EVENT_VERSION),
  actor_class: z.enum(PRODUCT_ACTOR_CLASSES),
  user_id: z.string().uuid().nullable(),
  anonymous_id: z.string().max(80).nullable(),
  offer_id: z.string().uuid().nullable(),
  source: z.string().max(64).nullable(),
  metadata: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])),
  dedupe_key: z.string().max(200).nullable(),
});

/**
 * Inserta en product_events con service role. No es fuente de dinero.
 * vote, favorite, comment, signup, offer_view y outbound_click no se escriben aquí.
 */
export async function recordProductEvent(input: {
  event: WritableProductEvent | string;
  userId?: string | null;
  anonymousId?: string | null;
  offerId?: string | null;
  source?: string | null;
  metadata?: unknown;
  dedupe?: boolean;
  nowMs?: number;
}): Promise<{ ok: boolean }> {
  if (!isWritableProductEvent(input.event)) return { ok: false };

  try {
    const supabase = createServerClient();
    const actorClass = await resolveProductActorClass(supabase, input.userId);
    const metadata = sanitizeFunnelMetadata(input.metadata);
    const actor = productActorKey(input.userId, input.anonymousId);
    const nowMs = input.nowMs ?? Date.now();

    let dedupeKey: string | null = null;
    if (input.dedupe !== false) {
      if (isPhase1BehaviorEvent(input.event)) {
        dedupeKey = phase1DedupeKey({ event: input.event, actor, metadata, nowMs });
        if (!dedupeKey) {
          observeFailure('missing_dedupe');
          return { ok: false };
        }
      } else {
        const hourBucket = new Date(nowMs).toISOString().slice(0, 13);
        dedupeKey = buildFunnelDedupeKey({
          event: input.event,
          userId: input.userId,
          anonymousId: input.anonymousId,
          offerId: input.offerId,
          bucket: hourBucket,
        });
      }
    }

    const row = {
      event_name: input.event,
      event_version: PRODUCT_EVENT_VERSION,
      actor_class: actorClass,
      user_id: input.userId?.trim() || null,
      anonymous_id: input.anonymousId ? input.anonymousId.slice(0, 80) : null,
      offer_id: input.offerId ?? null,
      source: input.source ? input.source.slice(0, 64) : null,
      metadata,
      dedupe_key: dedupeKey,
    };
    const parsed = productEventRowSchema.safeParse(row);
    if (!parsed.success) {
      observeFailure('schema');
      return { ok: false };
    }

    const { error } = await supabase.from('product_events').insert(parsed.data);

    if (error) {
      if (error.code === '23505') return { ok: true };
      observeFailure(error.code ?? 'insert');
      return { ok: false };
    }
    incrementLaunchMetric('analytics_events');
    return { ok: true };
  } catch {
    observeFailure('threw');
    return { ok: false };
  }
}
