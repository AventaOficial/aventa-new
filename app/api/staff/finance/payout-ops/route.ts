import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requirePayoutOps } from '@/lib/staff/requireFinanceStaff';
import {
  composePayoutOpsSnapshot,
  loadPayoutOpsData,
  resolvePayoutOpsRuntime,
} from '@/lib/finance/payoutOps';

export const dynamic = 'force-dynamic';

/**
 * Centro de Pagos — snapshot de solo lectura.
 * Acceso: owner + finance (requirePayoutOps). No mueve dinero.
 */
export async function GET(request: Request) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const supabase = createServerClient();
    const data = await loadPayoutOpsData(supabase);
    const runtime = resolvePayoutOpsRuntime();
    const snapshot = composePayoutOpsSnapshot(data, runtime, auth.role);
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[staff/finance/payout-ops]', e);
    return NextResponse.json({ error: 'No se pudo cargar el Centro de Pagos' }, { status: 500 });
  }
}
