import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

/** Listado de pools mensuales de comisiones. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);

  const supabase = createServerClient();
  const { data, error, count } = await supabase
    .from('commission_pools')
    .select(
      'id, period_key, period_start, period_end, gross_affiliate_cents, creator_share_bps, distributable_cents, eligible_users, total_points, status, notes, created_at, updated_at',
      { count: 'exact' }
    )
    .order('period_key', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    if (hasMissingTable(error, 'commission_pools')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo listar pools' }, { status: 500 });
  }

  return NextResponse.json({ pools: data ?? [], total: count ?? null, limit, offset });
}

/** Ajusta estado operativo de un pool (draft|locked|paid|cancelled). */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const poolId = typeof body?.id === 'string' ? body.id.trim() : '';
  const status = body?.status;
  if (!poolId) {
    return NextResponse.json({ error: 'id obligatorio' }, { status: 400 });
  }
  if (status !== 'draft' && status !== 'locked' && status !== 'paid' && status !== 'cancelled') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('commission_pools')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', poolId);
  if (error) {
    if (hasMissingTable(error, 'commission_pools')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo actualizar pool' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: poolId, status });
}
