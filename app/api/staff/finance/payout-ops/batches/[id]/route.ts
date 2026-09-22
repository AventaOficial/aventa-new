import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requirePayoutOps } from '@/lib/staff/requireFinanceStaff';
import {
  approvePayoutBatch,
  cancelPayoutBatch,
  getPayoutBatch,
  releasePayoutBatch,
  resolvePayoutOpsRuntime,
} from '@/lib/finance/payoutOps';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const batch = await getPayoutBatch(createServerClient(), id);
  if (!batch) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 });
  return NextResponse.json({ batch }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Body: { action: 'approve' | 'cancel' | 'release', force?: boolean, reason?: string }
 * approve → regla de dos personas (owner puede force). release → reserva payout_intents
 * (guards del money path dentro; en producción congelada queda deferred).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action : '';
  const actor = { id: auth.user.id, role: auth.role };
  const supabase = createServerClient();

  try {
    if (action === 'approve') {
      const r = await approvePayoutBatch(supabase, id, actor, body?.force === true);
      return r.ok
        ? NextResponse.json({ ok: true, batch: r.batch })
        : NextResponse.json({ error: r.error }, { status: r.status });
    }
    if (action === 'cancel') {
      const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;
      const r = await cancelPayoutBatch(supabase, id, actor, reason);
      return r.ok
        ? NextResponse.json({ ok: true, batch: r.batch })
        : NextResponse.json({ error: r.error }, { status: r.status });
    }
    if (action === 'release') {
      if (auth.role !== 'owner') {
        return NextResponse.json({ error: 'Solo owner puede liberar un lote' }, { status: 403 });
      }
      const r = await releasePayoutBatch(supabase, id, actor, resolvePayoutOpsRuntime());
      return r.ok
        ? NextResponse.json({ ok: true, batch: r.batch, summary: r.summary })
        : NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({ error: 'action inválida (approve | cancel | release)' }, { status: 400 });
  } catch (e) {
    console.error('[payout-ops/batches PATCH]', e);
    return NextResponse.json({ error: 'Operación de lote fallida' }, { status: 500 });
  }
}
