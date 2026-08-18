import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireFinanceRead, requireFinanceWrite, canFinanceWrite } from '@/lib/staff/requireFinanceStaff';

const MAX_LIMIT = 100;

function hasMissingTable(error: { message?: string } | null, table: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(table.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

export async function GET(request: Request) {
  const auth = await requireFinanceRead(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const network = url.searchParams.get('network')?.trim();

  const supabase = createServerClient();
  let q = supabase
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, currency, period_start, period_end, status, external_ref, notes, source, tracking_tag, attributable, meta, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (network) q = q.eq('network', network);

  const { data, error, count } = await q;
  if (error) {
    if (hasMissingTable(error, 'affiliate_ledger_entries')) {
      return NextResponse.json({ entries: [], total: 0, tableAvailable: false });
    }
    return NextResponse.json({ error: 'Error al listar ledger' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? 0, tableAvailable: true, canWrite: canFinanceWrite(auth.role) });
}

export async function PATCH(request: Request) {
  const auth = await requireFinanceWrite(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : null;
  const reviewed = body?.reviewed === true;

  if (!id) return NextResponse.json({ error: 'id obligatorio' }, { status: 400 });

  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('affiliate_ledger_entries')
    .select('notes, meta')
    .eq('id', id)
    .maybeSingle();

  const prevMeta =
    existing?.meta && typeof existing.meta === 'object' && !Array.isArray(existing.meta)
      ? (existing.meta as Record<string, unknown>)
      : {};

  const payload: { notes?: string | null; meta?: Record<string, unknown> } = {};
  if (notes !== null) payload.notes = notes;
  if (reviewed) {
    payload.meta = {
      ...prevMeta,
      finance_reviewed_at: new Date().toISOString(),
      finance_reviewed_by: auth.user.id,
    };
  }

  const { error } = await supabase.from('affiliate_ledger_entries').update(payload).eq('id', id);
  if (error) {
    if (hasMissingTable(error, 'affiliate_ledger_entries')) {
      return NextResponse.json({ error: 'Ledger no disponible' }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
