import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { isValidUuid } from '@/lib/server/validateUuid';

/** GET ?offerId=xxx — datos básicos de una oferta para el panel lateral de reportes (solo mods). */
export async function GET(request: NextRequest) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const offerId = request.nextUrl.searchParams.get('offerId')?.trim();
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, title, store, image_url, price, original_price, offer_url, status')
    .eq('id', offerId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
  }

  return NextResponse.json(data);
}
