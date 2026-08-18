import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';

export async function GET(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const canModerate = canAccessStaffDepartment(auth.role, 'moderacion');
  const canOperations = canAccessStaffDepartment(auth.role, 'operaciones');
  if (!canModerate && !canOperations) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      canWrite: canModerate,
      note: missing ? 'Ejecuta offer_health_state.sql en Supabase.' : error.message,
    });
  }

  return NextResponse.json({ rows: data ?? [], tableAvailable: true, canWrite: canModerate });
}
