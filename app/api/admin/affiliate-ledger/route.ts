import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { affiliateLedgerInsertSchema } from '@/lib/commissions/affiliateLedger';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function hasMissingTable(error: { message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes('affiliate_ledger') || m.includes('does not exist') || m.includes('schema cache');
}

/** GET: listado de movimientos del libro de afiliados (solo owner/admin). */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const network = url.searchParams.get('network')?.trim();

  const supabase = createServerClient();
  let q = supabase
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, currency, period_start, period_end, status, external_ref, notes, source, meta, created_at, updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (network) {
    q = q.eq('network', network);
  }

  const { data, error, count } = await q;
  if (error) {
    if (hasMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            'Tabla no creada. Ejecuta en Supabase: docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 }
      );
    }
    console.error('[affiliate-ledger GET]', error.message);
    return NextResponse.json({ error: 'Error al listar' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? null, limit, offset });
}

/** POST: alta manual de un movimiento (reporte descargado de Amazon, ML, etc.). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const raw = await request.json().catch(() => ({}));
  const parsed = affiliateLedgerInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 }
    );
  }

  const row = parsed.data;
  const supabase = createServerClient();
  const payload = {
    network: row.network,
    amount_cents: row.amount_cents,
    currency: row.currency,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status,
    external_ref: row.external_ref ?? null,
    notes: row.notes ?? null,
    source: row.source,
    meta: row.meta ?? {},
  };

  const { data, error } = await supabase.from('affiliate_ledger_entries').insert(payload).select('id').single();
  if (error) {
    if (hasMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            'Tabla no creada. Ejecuta en Supabase: docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 }
      );
    }
    if (error.code === '23505' || (error.message ?? '').includes('affiliate_ledger_unique_external')) {
      return NextResponse.json({ error: 'Ya existe un movimiento con esa red y referencia externa.' }, { status: 409 });
    }
    console.error('[affiliate-ledger POST]', error.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
