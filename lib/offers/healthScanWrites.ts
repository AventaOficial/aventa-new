import type { SupabaseClient } from '@supabase/supabase-js';
import { writeModerationAudit } from '@/lib/moderation/writeModerationAudit';

const LIVE_STATUSES = ['approved', 'published'] as const;

/**
 * Expira una oferta viva confirmada como inexistente (404/410 en racha).
 * El guard se re-evalúa en el UPDATE: si entre lectura y escritura la oferta fue
 * rechazada, borrada o archivada, no se toca. Solo se audita si hubo cambio real.
 */
export async function expireConfirmedGoneOffer(
  supabase: SupabaseClient,
  input: { offerId: string; previousExpiresAt: string | null; diagnostic: string | null; streak: number; now?: Date },
): Promise<{ expired: boolean; audited: boolean }> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const { data, error } = await supabase
    .from('offers')
    .update({ expires_at: nowIso })
    .eq('id', input.offerId)
    .in('status', [...LIVE_STATUSES])
    .is('deleted_at', null)
    .is('archived_at', null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .select('id, status');
  if (error || !Array.isArray(data) || data.length === 0) return { expired: false, audited: false };

  const status = (data[0] as { status?: string }).status ?? null;
  const audit = await writeModerationAudit(supabase, {
    offerId: input.offerId,
    userId: null,
    action: 'expired',
    previousStatus: status,
    newStatus: status,
    reason: 'health_scan_confirmed_gone',
    metadata: {
      source: 'offer_health_scan',
      automatic: true,
      diagnostic: input.diagnostic,
      streak: input.streak,
      previous_expires_at: input.previousExpiresAt,
      expires_at: nowIso,
    },
  });
  return { expired: true, audited: audit.ok };
}

/** Extiende la vigencia solo si la oferta sigue viva en el momento del UPDATE. */
export async function extendLiveOfferExpiry(
  supabase: SupabaseClient,
  input: { offerId: string; expiresAt: string },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('offers')
    .update({ expires_at: input.expiresAt })
    .eq('id', input.offerId)
    .in('status', [...LIVE_STATUSES])
    .is('deleted_at', null)
    .is('archived_at', null)
    .select('id');
  return !error && Array.isArray(data) && data.length > 0;
}
