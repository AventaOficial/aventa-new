import { createServerClient } from '@/lib/supabase/server';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';

export type DedupeEventType = 'view' | 'outbound';

const WINDOW_MS: Record<DedupeEventType, number> = {
  view: 30 * 60 * 1000,
  outbound: 10 * 60 * 1000,
};

/**
 * Evita inflar métricas: 1 view / 30 min y 1 outbound / 10 min
 * por (oferta + usuario) o (oferta + IP) si es anónimo.
 */
export async function shouldSkipDuplicateOfferEvent(opts: {
  offerId: string;
  eventType: DedupeEventType;
  userId: string | null;
  ip: string;
}): Promise<boolean> {
  const actor = opts.userId ? `u:${opts.userId}` : `ip:${opts.ip || 'unknown'}`;
  const preset = opts.eventType === 'view' ? 'telemetryView' : 'telemetryOutbound';
  const rl = await enforceRateLimitCustom(`evt:${opts.eventType}:${opts.offerId}:${actor}`, preset);
  if (!rl.success) return true;

  if (!opts.userId) return false;

  try {
    const supabase = createServerClient();
    const windowStart = new Date(Date.now() - WINDOW_MS[opts.eventType]).toISOString();
    const { data: recent } = await supabase
      .from('offer_events')
      .select('id')
      .eq('offer_id', opts.offerId)
      .eq('user_id', opts.userId)
      .eq('event_type', opts.eventType)
      .gte('created_at', windowStart)
      .limit(1);
    return Boolean(recent && recent.length > 0);
  } catch (e) {
    console.error('[offerEventDedupe] check failed:', e);
    return false;
  }
}
