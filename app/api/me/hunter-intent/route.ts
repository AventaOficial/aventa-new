import { NextResponse } from 'next/server';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { requireBearerCommunityUser } from '@/lib/server/requireCommunityUser';

/**
 * Intención de cazador: el usuario abrió el envío canónico y todavía no tiene ofertas.
 * No crea una oferta. No escribe si ya hay envíos.
 */
export async function POST(request: Request) {
  const auth = await requireBearerCommunityUser(request);
  if ('error' in auth) {
    return NextResponse.json({ ok: false }, { status: auth.status });
  }

  const existing = await auth.supabase
    .from('offers')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', auth.user.id)
    .is('deleted_at', null);

  if (existing.error || existing.count == null) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  if (existing.count > 0) {
    return NextResponse.json({ ok: true, recorded: false });
  }

  const written = await recordProductEvent({
    event: 'hunter_intent',
    userId: auth.user.id,
    source: 'composer',
    metadata: { surface: 'composer' },
  });
  return NextResponse.json({ ok: written.ok, recorded: written.ok });
}
