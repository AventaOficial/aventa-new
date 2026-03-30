import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

/** Listado de asignaciones por pool. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const poolId = url.searchParams.get('pool_id')?.trim() ?? '';
  if (!poolId) {
    return NextResponse.json({ error: 'pool_id es obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('commission_allocations')
    .select('id, pool_id, user_id, points, amount_cents, status, paid_at, notes, meta, created_at, updated_at')
    .eq('pool_id', poolId)
    .order('amount_cents', { ascending: false });

  if (error) {
    if (hasMissingTable(error, 'commission_allocations')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo listar asignaciones' }, { status: 500 });
  }

  return NextResponse.json({ allocations: data ?? [] });
}

/**
 * Actualización masiva de estatus (pending|paid|void) en asignaciones.
 * paid establece paid_at; pending/void lo limpia.
 */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const status = body?.status;
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null;
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids es obligatorio' }, { status: 400 });
  }
  if (status !== 'pending' && status !== 'paid' && status !== 'void') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const payload: { status: 'pending' | 'paid' | 'void'; paid_at: string | null; notes?: string | null } = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };
  if (notes !== null) payload.notes = notes;

  const supabase = createServerClient();
  const { error } = await supabase.from('commission_allocations').update(payload).in('id', ids);
  if (error) {
    if (hasMissingTable(error, 'commission_allocations')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo actualizar asignaciones' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: ids.length, status });
}
