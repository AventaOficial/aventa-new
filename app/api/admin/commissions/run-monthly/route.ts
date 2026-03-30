import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  allocateByPoints,
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  parsePeriodKey,
} from '@/lib/commissions/monthlyPayout';

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

/** Genera snapshot mensual: pool + asignaciones a creadores elegibles y activos. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const period = typeof body?.period === 'string' ? body.period : '';
  const range = parsePeriodKey(period);
  if (!range) {
    return NextResponse.json({ error: 'period debe ser YYYY-MM' }, { status: 400 });
  }

  const creatorShareBpsRaw = Number(body?.creator_share_bps);
  const creatorShareBps =
    Number.isFinite(creatorShareBpsRaw) && creatorShareBpsRaw >= 0 && creatorShareBpsRaw <= 10000
      ? Math.floor(creatorShareBpsRaw)
      : COMMISSION_DEFAULT_CREATOR_SHARE_BPS;

  const supabase = createServerClient();

  const { data: existingPool, error: existingPoolError } = await supabase
    .from('commission_pools')
    .select('id')
    .eq('period_key', range.periodKey)
    .maybeSingle();
  if (existingPoolError && hasMissingTable(existingPoolError, 'commission_pools')) {
    return NextResponse.json(
      {
        error:
          'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
      },
      { status: 503 }
    );
  }
  if (existingPool?.id) {
    return NextResponse.json(
      { error: 'Ya existe un pool para ese periodo (idempotente por period_key).' },
      { status: 409 }
    );
  }

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('affiliate_ledger_entries')
    .select('amount_cents, status, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.nextStartIso)
    .in('status', ['accrued', 'paid']);
  if (ledgerError) {
    if (hasMissingTable(ledgerError, 'affiliate_ledger')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'No se pudo leer affiliate_ledger_entries' }, { status: 500 });
  }
  const grossAffiliateCents = (ledgerRows ?? []).reduce(
    (sum, r: { amount_cents?: number | null }) => sum + Number(r.amount_cents ?? 0),
    0
  );
  const distributableCents = Math.max(0, Math.floor((grossAffiliateCents * creatorShareBps) / 10000));

  const { data: offerRows, error: offersError } = await supabase
    .from('offers')
    .select('created_by, upvotes_count, status, created_at')
    .gte('created_at', range.startIso)
    .lt('created_at', range.nextStartIso)
    .in('status', ['approved', 'published']);
  if (offersError) {
    return NextResponse.json({ error: 'No se pudieron leer ofertas del periodo' }, { status: 500 });
  }

  const qualifyingPoints = new Map<string, number>();
  for (const row of offerRows ?? []) {
    const userId = (row as { created_by?: string | null }).created_by;
    const upvotes = Number((row as { upvotes_count?: number | null }).upvotes_count ?? 0);
    if (!userId) continue;
    if (upvotes < COMMISSION_MIN_UPVOTES_PER_OFFER) continue;
    qualifyingPoints.set(userId, (qualifyingPoints.get(userId) ?? 0) + 1);
  }
  const userIds = Array.from(qualifyingPoints.keys());

  let activeUsers = new Set<string>();
  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, commissions_accepted_at')
      .in('id', userIds)
      .not('commissions_accepted_at', 'is', null);
    if (profileError) {
      if (
        (profileError.message ?? '').includes('commissions_accepted_at') ||
        profileError.code === 'PGRST204'
      ) {
        return NextResponse.json(
          {
            error:
              'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_program_profiles.sql',
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: 'No se pudo validar activación de comisiones' }, { status: 500 });
    }
    activeUsers = new Set((profileRows ?? []).map((r: { id: string }) => r.id));
  }

  const pointsRows = Array.from(qualifyingPoints.entries())
    .filter(([userId, points]) => activeUsers.has(userId) && points >= 1)
    .map(([userId, points]) => ({ userId, points }));
  const totalPoints = pointsRows.reduce((sum, r) => sum + r.points, 0);
  const allocations = allocateByPoints(distributableCents, pointsRows);

  const { data: poolRow, error: poolInsertError } = await supabase
    .from('commission_pools')
    .insert({
      period_key: range.periodKey,
      period_start: range.startDate,
      period_end: range.endDate,
      gross_affiliate_cents: grossAffiliateCents,
      creator_share_bps: creatorShareBps,
      distributable_cents: distributableCents,
      eligible_users: pointsRows.length,
      total_points: totalPoints,
      status: 'locked',
      created_by: auth.user.id,
      notes: `Generado automático. Requisito de votos por oferta: ${COMMISSION_MIN_UPVOTES_PER_OFFER}.`,
    })
    .select('id, period_key')
    .single();
  if (poolInsertError) {
    if (hasMissingTable(poolInsertError, 'commission_pools')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 }
      );
    }
    if (poolInsertError.code === '23505') {
      return NextResponse.json({ error: 'Pool duplicado para ese periodo.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo crear commission_pools' }, { status: 500 });
  }

  if (allocations.length > 0) {
    const { error: allocationsError } = await supabase.from('commission_allocations').insert(
      allocations.map((a) => ({
        pool_id: poolRow.id,
        user_id: a.userId,
        points: a.points,
        amount_cents: a.amountCents,
        status: 'pending',
        meta: {
          rule: 'points_per_qualifying_offer',
        },
      }))
    );
    if (allocationsError) {
      return NextResponse.json(
        {
          error: 'Pool creado, pero falló insert de asignaciones (revisar manualmente).',
          pool_id: poolRow.id,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    pool_id: poolRow.id,
    period: poolRow.period_key,
    gross_affiliate_cents: grossAffiliateCents,
    creator_share_bps: creatorShareBps,
    distributable_cents: distributableCents,
    eligible_users: pointsRows.length,
    total_points: totalPoints,
    allocations_count: allocations.length,
  });
}
