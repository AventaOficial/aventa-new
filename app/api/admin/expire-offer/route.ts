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
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('offers')
    .update({ expires_at: now })
    .eq('id', offerId);

  if (error) {
    console.error('[expire-offer] update failed:', error.message);
    return NextResponse.json({ error: 'Error al marcar como expirada' }, { status: 500 });
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
