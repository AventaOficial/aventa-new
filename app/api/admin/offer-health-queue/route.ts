import { NextResponse } from 'next/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  if (status !== 'price_changed' && status !== 'out_of_stock') {
    return NextResponse.json({ error: 'status debe ser price_changed u out_of_stock' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('offer_health_state')
    .select(
      'offer_id, status, last_checked_at, published_price, live_price, price_delta_pct, diagnostic, offers(id, title, price, original_price, store, image_url, offer_url, status)'
    )
    .eq('status', status)
    .order('last_checked_at', { ascending: false })
    .limit(100);

  if (error) {
    const missing = error.message?.toLowerCase().includes('offer_health_state');
    return NextResponse.json({
      rows: [],
      tableAvailable: !missing,
      note: missing ? 'Ejecuta offer_health_state.sql en Supabase.' : error.message,
    });
  }

  return NextResponse.json({ rows: data ?? [], tableAvailable: true });
}
