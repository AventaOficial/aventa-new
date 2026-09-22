import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requirePayoutOps } from '@/lib/staff/requireFinanceStaff';
import {
  composePayoutOpsSnapshot,
  createPayoutBatch,
  listPayoutBatches,
  loadPayoutOpsData,
  resolvePayoutOpsRuntime,
} from '@/lib/finance/payoutOps';

export const dynamic = 'force-dynamic';

/** Lista lotes (V3). */
export async function GET(request: Request) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const res = await listPayoutBatches(createServerClient(), 24);
    return NextResponse.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[payout-ops/batches GET]', e);
    return NextResponse.json({ error: 'No se pudieron listar los lotes' }, { status: 500 });
  }
}

/**
 * Prepara un lote (draft) a partir del preview actual. Body: { notes?: string }
 * No mueve dinero. Idempotencia: un lote activo por periodo (409 si ya existe).
 */
export async function POST(request: Request) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null;

  try {
    const supabase = createServerClient();
    const data = await loadPayoutOpsData(supabase);
    const runtime = resolvePayoutOpsRuntime();
    const snapshot = composePayoutOpsSnapshot(data, runtime, auth.role);
    const result = await createPayoutBatch(
      supabase,
      snapshot.batch,
      { minPayoutCents: snapshot.config.minPayoutCents, creatorShareBps: snapshot.config.creatorShareBps },
      { id: auth.user.id, role: auth.role },
      notes,
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, batch: result.batch }, { status: 201 });
  } catch (e) {
    console.error('[payout-ops/batches POST]', e);
    return NextResponse.json({ error: 'No se pudo preparar el lote' }, { status: 500 });
  }
}
