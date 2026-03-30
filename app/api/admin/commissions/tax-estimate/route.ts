import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { parsePeriodKey } from '@/lib/commissions/monthlyPayout';

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

/** Estimado operativo mensual (referencial) para control contable interno. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const period = url.searchParams.get('period')?.trim() ?? '';
  const range = parsePeriodKey(period);
  if (!range) {
    return NextResponse.json({ error: 'period debe ser YYYY-MM' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('affiliate_ledger_entries')
    .select('amount_cents, status, created_at, network')
    .gte('created_at', range.startIso)
    .lt('created_at', range.nextStartIso)
    .in('status', ['accrued', 'paid']);
  if (ledgerError) {
    if (hasMissingTable(ledgerError, 'affiliate_ledger')) {
      return NextResponse.json(
        { error: 'Falta migración SQL affiliate_platform_ledger.sql' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo leer ledger' }, { status: 500 });
  }

  const grossAffiliateCents = (ledgerRows ?? []).reduce(
    (sum, r: { amount_cents?: number | null }) => sum + Number(r.amount_cents ?? 0),
    0
  );

  const byNetwork: Record<string, number> = {};
  for (const row of ledgerRows ?? []) {
    const network = (row as { network?: string | null }).network ?? 'other';
    byNetwork[network] = (byNetwork[network] ?? 0) + Number((row as { amount_cents?: number | null }).amount_cents ?? 0);
  }

  const { data: pool, error: poolError } = await supabase
    .from('commission_pools')
    .select('id, period_key, creator_share_bps, distributable_cents, status')
    .eq('period_key', range.periodKey)
    .maybeSingle();
  if (poolError && hasMissingTable(poolError, 'commission_pools')) {
    return NextResponse.json(
      { error: 'Falta migración SQL commissions_pools_allocations.sql' },
      { status: 503 }
    );
  }

  let allocationsPaidCents = 0;
  let allocationsPendingCents = 0;
  let allocationsVoidCents = 0;

  if (pool?.id) {
    const { data: allocations, error: allocError } = await supabase
      .from('commission_allocations')
      .select('amount_cents, status')
      .eq('pool_id', pool.id);
    if (allocError) {
      return NextResponse.json({ error: 'No se pudieron leer asignaciones del pool' }, { status: 500 });
    }
    for (const row of allocations ?? []) {
      const amount = Number((row as { amount_cents?: number | null }).amount_cents ?? 0);
      const status = (row as { status?: string | null }).status ?? 'pending';
      if (status === 'paid') allocationsPaidCents += amount;
      else if (status === 'void') allocationsVoidCents += amount;
      else allocationsPendingCents += amount;
    }
  }

  const distributableCents = Number(pool?.distributable_cents ?? 0);
  const platformNetBeforeTaxCents = grossAffiliateCents - distributableCents;

  return NextResponse.json({
    period: range.periodKey,
    income: {
      gross_affiliate_cents: grossAffiliateCents,
      by_network_cents: byNetwork,
    },
    creator_program: {
      pool_id: pool?.id ?? null,
      pool_status: pool?.status ?? null,
      creator_share_bps: Number(pool?.creator_share_bps ?? null),
      distributable_cents: distributableCents,
      allocations_paid_cents: allocationsPaidCents,
      allocations_pending_cents: allocationsPendingCents,
      allocations_void_cents: allocationsVoidCents,
    },
    platform: {
      net_before_tax_cents: platformNetBeforeTaxCents,
    },
    note:
      'Estimado operativo para control interno. Para SAT/fiscalidad final, validar CFDI, retenciones e IVA/ISR con contador.',
  });
}
