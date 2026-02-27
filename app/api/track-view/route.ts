import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';

/**
 * POST: Registrar evento view (tarjeta visible ≥50% por 1s).
 * Body: { offerId: string } o { offer_id: string }
 * Retorna 204.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limitResult = await enforceRateLimit(ip);
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const offerId = (typeof body?.offerId === 'string' ? body.offerId : body?.offer_id)?.trim() || null;

    if (!offerId || !isValidUuid(offerId)) {
      return new NextResponse(null, { status: 400 });
    }

    let userId: string | null = null;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (token) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        const userRes = await fetch(`${url}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        });
        if (userRes.ok) {
          const userData = await userRes.json().catch(() => null);
          userId = userData?.id ?? null;
        }
      }
    }

    const supabase = createServerClient();
    const { error } = await supabase.from('offer_events').insert({
      offer_id: offerId,
      user_id: userId,
      event_type: 'view',
    });

    if (error) {
      console.error('[track-view] insert failed:', error.message);
    }
  } catch {
    // Silenciar errores; no bloquear
  }

  return new NextResponse(null, { status: 204 });
}
