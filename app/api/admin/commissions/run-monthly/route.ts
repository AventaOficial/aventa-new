import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  allocateByAttributedRevenue,
  allocateByPoints,
  COMMISSION_DEFAULT_ALLOCATION_RULE,
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_REQUIRED_OFFERS,
  isCommissionAllocationRule,
  parsePeriodKey,
  payoutHoldReleaseIso,
  type CommissionAllocationRule,
} from '@/lib/commissions/monthlyPayout';
import { COMMISSION_TERMS_VERSION } from '@/lib/commissions/constants';
import { resolveLedgerAttribution } from '@/lib/commissions/resolveAttribution';

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

/** Genera snapshot mensual: pool + asignaciones (atribuido o legacy por puntos). */
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

  const ruleRaw = body?.allocation_rule;
  const allocationRule: CommissionAllocationRule = isCommissionAllocationRule(ruleRaw)
    ? ruleRaw
    : COMMISSION_DEFAULT_ALLOCATION_RULE;

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
      { status: 503 },
    );
  }
  if (existingPool?.id) {
    return NextResponse.json(
      { error: 'Ya existe un pool para ese periodo (idempotente por period_key).' },
      { status: 409 },
    );
  }

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('affiliate_ledger_entries')
    .select(
      'amount_cents, status, created_at, period_start, period_end, creator_id, tracking_tag, attributable',
    )
    .in('status', ['accrued', 'paid']);
  if (ledgerError) {
    if (hasMissingTable(ledgerError, 'affiliate_ledger')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 },
      );
    }
    // Columnas nuevas aún no migradas: reintentar select mínimo
    if (
      (ledgerError.message ?? '').includes('creator_id') ||
      (ledgerError.message ?? '').includes('attributable') ||
      ledgerError.code === 'PGRST204'
    ) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL de atribución. Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo leer affiliate_ledger_entries' }, { status: 500 });
  }

  /** Incluye filas del periodo del reporte; si no hay period_start, cae a created_at (legacy). */
  const ledgerInPeriod = (ledgerRows ?? []).filter((row) => {
    const periodStart = (row as { period_start?: string | null }).period_start;
    if (periodStart) {
      return periodStart >= range.startDate && periodStart <= range.endDate;
    }
    const createdAt = String((row as { created_at?: string | null }).created_at ?? '');
    return createdAt >= range.startIso && createdAt < range.nextStartIso;
  });

  const tagsNeeded = new Set<string>();
  for (const row of ledgerInPeriod) {
    const tag = String((row as { tracking_tag?: string | null }).tracking_tag ?? '')
      .trim()
      .toLowerCase();
    if (tag && !(row as { creator_id?: string | null }).creator_id) tagsNeeded.add(tag);
  }

  const tagToUserId = new Map<string, string>();
  if (tagsNeeded.size > 0) {
    const { data: allTagged } = await supabase
      .from('profiles')
      .select('id, ml_tracking_tag, amazon_tracking_tag')
      .or('ml_tracking_tag.not.is.null,amazon_tracking_tag.not.is.null');
    for (const p of allTagged ?? []) {
      const ml = String((p as { ml_tracking_tag?: string | null }).ml_tracking_tag ?? '')
        .trim()
        .toLowerCase();
      const amz = String((p as { amazon_tracking_tag?: string | null }).amazon_tracking_tag ?? '')
        .trim()
        .toLowerCase();
      if (ml && tagsNeeded.has(ml)) tagToUserId.set(ml, (p as { id: string }).id);
      if (amz && tagsNeeded.has(amz)) tagToUserId.set(amz, (p as { id: string }).id);
    }
  }

  const attribution = resolveLedgerAttribution(
    ledgerInPeriod as Array<{
      amount_cents: number | null;
      creator_id?: string | null;
      tracking_tag?: string | null;
      attributable?: boolean | null;
    }>,
    tagToUserId,
  );

  const holdReleaseIso = payoutHoldReleaseIso(range);

  // Usuarios con programa aceptado (candidatos a cobro)
  const attributedUserIds = Array.from(attribution.byCreatorCents.keys());
  let activeUsers = new Set<string>();

  if (allocationRule === 'attributed_revenue') {
    if (attributedUserIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, commissions_accepted_at, commissions_terms_version')
        .in('id', attributedUserIds)
        .not('commissions_accepted_at', 'is', null)
        .eq('commissions_terms_version', COMMISSION_TERMS_VERSION);
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
            { status: 503 },
          );
        }
        return NextResponse.json({ error: 'No se pudo validar activación de comisiones' }, { status: 500 });
      }
      activeUsers = new Set((profileRows ?? []).map((r: { id: string }) => r.id));
    }

    // Elegibilidad 15×120: solo quienes ya desbloquearon el programa
    const eligibleIds = new Set<string>();
    const activeList = Array.from(activeUsers);
    if (activeList.length > 0) {
      const { data: offerRows } = await supabase
        .from('offers')
        .select('created_by, upvotes_count, status')
        .in('created_by', activeList)
        .in('status', ['approved', 'published']);
      const qualifyingByUser = new Map<string, number>();
      for (const o of offerRows ?? []) {
        const uid = (o as { created_by?: string | null }).created_by;
        const up = Number((o as { upvotes_count?: number | null }).upvotes_count ?? 0);
        if (!uid || up < COMMISSION_MIN_UPVOTES_PER_OFFER) continue;
        qualifyingByUser.set(uid, (qualifyingByUser.get(uid) ?? 0) + 1);
      }
      for (const [uid, count] of qualifyingByUser) {
        if (count >= COMMISSION_REQUIRED_OFFERS) eligibleIds.add(uid);
      }
    }

    const attributedRows = Array.from(attribution.byCreatorCents.entries()).map(
      ([userId, attributedCents]) => ({ userId, attributedCents }),
    );
    let allocations = allocateByAttributedRevenue(attributedRows, creatorShareBps, {
      minPayoutCents: COMMISSION_MIN_PAYOUT_CENTS,
      eligibleUserIds: eligibleIds,
    });

    // Carry: suma montos pending marcados below_minimum de periodos previos
    const allocUserIds = allocations.map((a) => a.userId);
    const carryByUser = new Map<string, number>();
    const carrySourceIds: string[] = [];
    if (allocUserIds.length > 0) {
      const { data: prevPending } = await supabase
        .from('commission_allocations')
        .select('id, user_id, amount_cents, meta, status')
        .eq('status', 'pending')
        .in('user_id', allocUserIds);
      for (const row of prevPending ?? []) {
        const meta = (row as { meta?: { below_minimum?: boolean } | null }).meta;
        if (!meta?.below_minimum) continue;
        const uid = (row as { user_id: string }).user_id;
        const cents = Number((row as { amount_cents?: number }).amount_cents ?? 0);
        if (!Number.isFinite(cents) || cents <= 0) continue;
        carryByUser.set(uid, (carryByUser.get(uid) ?? 0) + Math.floor(cents));
        carrySourceIds.push((row as { id: string }).id);
      }
      if (carryByUser.size > 0) {
        allocations = allocations.map((a) => {
          const carry = carryByUser.get(a.userId) ?? 0;
          const amountCents = a.amountCents + carry;
          return {
            ...a,
            amountCents,
            belowMinimum: amountCents < COMMISSION_MIN_PAYOUT_CENTS,
          };
        });
      }
    }

    const distributableCents = allocations.reduce((s, a) => s + a.amountCents, 0);

    const poolPayload: Record<string, unknown> = {
      period_key: range.periodKey,
      period_start: range.startDate,
      period_end: range.endDate,
      gross_affiliate_cents: attribution.grossCents,
      creator_share_bps: creatorShareBps,
      distributable_cents: distributableCents,
      eligible_users: allocations.length,
      total_points: 0,
      status: 'locked',
      created_by: auth.user.id,
      notes: `Regla attributed_revenue. Hold hasta ${holdReleaseIso.slice(0, 10)}. Mínimo payout ${COMMISSION_MIN_PAYOUT_CENTS} centavos.`,
      allocation_rule: 'attributed_revenue',
      attributable_cents: attribution.attributableCents,
      unattributable_cents: attribution.unattributableCents,
    };

    const { data: poolRow, error: poolInsertError } = await supabase
      .from('commission_pools')
      .insert(poolPayload)
      .select('id, period_key')
      .single();

    if (poolInsertError) {
      if (hasMissingTable(poolInsertError, 'commission_pools')) {
        return NextResponse.json(
          {
            error:
              'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
          },
          { status: 503 },
        );
      }
      if (
        (poolInsertError.message ?? '').includes('allocation_rule') ||
        poolInsertError.code === 'PGRST204'
      ) {
        return NextResponse.json(
          {
            error:
              'Falta migración SQL de atribución. Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql',
          },
          { status: 503 },
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
          points: 0,
          amount_cents: a.amountCents,
          status: 'pending',
          meta: {
            rule: 'attributed_revenue',
            attributed_cents: a.attributedCents ?? 0,
            creator_share_bps: creatorShareBps,
            below_minimum: Boolean(a.belowMinimum),
            hold_release_at: holdReleaseIso,
            min_payout_cents: COMMISSION_MIN_PAYOUT_CENTS,
            carry_cents: carryByUser.get(a.userId) ?? 0,
          },
        })),
      );
      if (allocationsError) {
        return NextResponse.json(
          {
            error: 'Pool creado, pero falló insert de asignaciones (revisar manualmente).',
            pool_id: poolRow.id,
          },
          { status: 500 },
        );
      }
      if (carrySourceIds.length > 0) {
        const { error: voidCarryError } = await supabase
          .from('commission_allocations')
          .update({
            status: 'void',
            notes: `Carry aplicado al periodo ${range.periodKey}`,
          })
          .in('id', carrySourceIds)
          .eq('status', 'pending');
        if (voidCarryError) {
          console.error('[run-monthly] void carry sources failed:', voidCarryError.message);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      pool_id: poolRow.id,
      period: poolRow.period_key,
      allocation_rule: 'attributed_revenue',
      gross_affiliate_cents: attribution.grossCents,
      attributable_cents: attribution.attributableCents,
      unattributable_cents: attribution.unattributableCents,
      creator_share_bps: creatorShareBps,
      distributable_cents: distributableCents,
      eligible_users: allocations.length,
      total_points: 0,
      allocations_count: allocations.length,
      hold_release_at: holdReleaseIso,
    });
  }

  // ── Legacy: points_per_qualifying_offer ─────────────────────────────────────
  const grossAffiliateCents = attribution.grossCents;
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

  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, commissions_accepted_at, commissions_terms_version')
      .in('id', userIds)
      .not('commissions_accepted_at', 'is', null)
      .eq('commissions_terms_version', COMMISSION_TERMS_VERSION);
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
          { status: 503 },
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

  const poolPayloadLegacy: Record<string, unknown> = {
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
    notes: `Regla legacy points_per_qualifying_offer. Umbral votos: ${COMMISSION_MIN_UPVOTES_PER_OFFER}.`,
    allocation_rule: 'points_per_qualifying_offer',
    attributable_cents: attribution.attributableCents,
    unattributable_cents: attribution.unattributableCents,
  };

  const { data: poolRow, error: poolInsertError } = await supabase
    .from('commission_pools')
    .insert(poolPayloadLegacy)
    .select('id, period_key')
    .single();
  if (poolInsertError) {
    if (hasMissingTable(poolInsertError, 'commission_pools')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 },
      );
    }
    if (poolInsertError.code === '23505') {
      return NextResponse.json({ error: 'Pool duplicado para ese periodo.' }, { status: 409 });
    }
    // Si faltan columnas nuevas, insertar sin ellas
    if (
      (poolInsertError.message ?? '').includes('allocation_rule') ||
      poolInsertError.code === 'PGRST204'
    ) {
      const { data: poolFallback, error: fallbackErr } = await supabase
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
          notes: `Legacy sin columnas attribution. Umbral: ${COMMISSION_MIN_UPVOTES_PER_OFFER}.`,
        })
        .select('id, period_key')
        .single();
      if (fallbackErr || !poolFallback) {
        return NextResponse.json(
          {
            error:
              'Falta migración SQL de atribución. Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql',
          },
          { status: 503 },
        );
      }
      if (allocations.length > 0) {
        await supabase.from('commission_allocations').insert(
          allocations.map((a) => ({
            pool_id: poolFallback.id,
            user_id: a.userId,
            points: a.points,
            amount_cents: a.amountCents,
            status: 'pending',
            meta: { rule: 'points_per_qualifying_offer' },
          })),
        );
      }
      return NextResponse.json({
        ok: true,
        pool_id: poolFallback.id,
        period: poolFallback.period_key,
        allocation_rule: 'points_per_qualifying_offer',
        gross_affiliate_cents: grossAffiliateCents,
        creator_share_bps: creatorShareBps,
        distributable_cents: distributableCents,
        eligible_users: pointsRows.length,
        total_points: totalPoints,
        allocations_count: allocations.length,
      });
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
        meta: { rule: 'points_per_qualifying_offer' },
      })),
    );
    if (allocationsError) {
      return NextResponse.json(
        {
          error: 'Pool creado, pero falló insert de asignaciones (revisar manualmente).',
          pool_id: poolRow.id,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    pool_id: poolRow.id,
    period: poolRow.period_key,
    allocation_rule: 'points_per_qualifying_offer',
    gross_affiliate_cents: grossAffiliateCents,
    attributable_cents: attribution.attributableCents,
    unattributable_cents: attribution.unattributableCents,
    creator_share_bps: creatorShareBps,
    distributable_cents: distributableCents,
    eligible_users: pointsRows.length,
    total_points: totalPoints,
    allocations_count: allocations.length,
  });
}
