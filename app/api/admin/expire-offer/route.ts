import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { isValidUuid } from '@/lib/server/validateUuid';

/** POST: marca una oferta como expirada (expires_at = ahora). Solo mods. */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : null;
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: offer } = await supabase.from('offers').select('created_by').eq('id', offerId).single();
  const createdBy = (offer as { created_by?: string } | null)?.created_by;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('offers')
    .update({ expires_at: now })
    .eq('id', offerId);

  if (error) {
    console.error('[expire-offer] update failed:', error.message);
    return NextResponse.json({ error: 'Error al marcar como expirada' }, { status: 500 });
  }

  if (createdBy) {
    await supabase.from('notifications').insert({
      user_id: createdBy,
      type: 'offer_removed',
      title: 'Tu oferta fue retirada del feed',
      body: 'Los moderadores retiraron esta oferta (por reportes o por estar expirada). Si tienes dudas, contacta al equipo.',
      link: '/me',
    }).then(({ error: notifErr }) => { if (notifErr) console.error('[expire-offer] notification failed:', notifErr.message); });
  }

  try {
    await supabase.from('moderation_logs').insert({
      offer_id: offerId,
      user_id: auth.user.id,
      action: 'expired',
      previous_status: null,
      new_status: 'expired',
      reason: null,
    });
  } catch {
    // tabla puede no existir o no tener action 'expired'
  }

  return NextResponse.json({ ok: true });
}
