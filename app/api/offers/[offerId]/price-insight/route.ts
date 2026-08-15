import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/server/validateUuid';
import { buildOfferPriceInsight } from '@/lib/offers/priceHistory';
import { getClientIp, enforceRateLimit } from '@/lib/server/rateLimit';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> },
) {
  const ip = getClientIp(_request);
  const rl = await enforceRateLimit(ip);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
  }

  const { offerId } = await params;
  if (!isValidUuid(offerId)) {
    return NextResponse.json({ error: 'Oferta inválida' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data: offer, error } = await supabase
      .from('offers')
      .select('id, price, original_price, status')
      .eq('id', offerId)
      .maybeSingle();

    if (error || !offer) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    const status = (offer as { status?: string }).status;
    if (status !== 'approved' && status !== 'published') {
      return NextResponse.json({ error: 'Oferta no disponible' }, { status: 404 });
    }

    const price = Number((offer as { price?: number }).price ?? 0);
    const originalPrice = (offer as { original_price?: number | null }).original_price;
    const insight = await buildOfferPriceInsight(supabase, {
      offerId,
      currentPrice: price,
      originalPrice: originalPrice ?? null,
    });

    return NextResponse.json({ insight });
  } catch (e) {
    console.error('[price-insight]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
