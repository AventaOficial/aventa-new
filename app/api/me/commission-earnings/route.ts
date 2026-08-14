import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_PAYOUT_HOLD_DAYS,
} from '@/lib/commissions/constants';

/**
 * Desglose de comisiones del usuario autenticado (allocations + tags).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('ml_tracking_tag, amazon_tracking_tag, commissions_accepted_at, commissions_terms_version')
    .eq('id', user.id)
    .maybeSingle();

  const { data: allocations, error: allocError } = await supabase
    .from('commission_allocations')
    .select(
      'id, points, amount_cents, status, paid_at, meta, created_at, pool_id, commission_pools(period_key, status, allocation_rule, creator_share_bps, period_end)',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(24);

  if (allocError) {
    if (
      (allocError.message ?? '').includes('commission_allocations') ||
      allocError.message?.includes('does not exist')
    ) {
      return NextResponse.json({
        tags: {
          ml_tracking_tag: (profile as { ml_tracking_tag?: string | null } | null)?.ml_tracking_tag ?? null,
          amazon_tracking_tag:
            (profile as { amazon_tracking_tag?: string | null } | null)?.amazon_tracking_tag ?? null,
        },
        summary: {
          pending_cents: 0,
          paid_cents: 0,
          void_cents: 0,
          below_minimum_count: 0,
        },
        policy: {
          creator_share_bps: COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
          min_payout_cents: COMMISSION_MIN_PAYOUT_CENTS,
          hold_days: COMMISSION_PAYOUT_HOLD_DAYS,
        },
        allocations: [],
        note: 'Tablas de comisiones aún no migradas',
      });
    }
    console.error('[me/commission-earnings]', allocError.message);
    return NextResponse.json({ error: 'No se pudieron cargar earnings' }, { status: 500 });
  }

  let pending = 0;
  let paid = 0;
  let voided = 0;
  let belowMin = 0;

  const rows = (allocations ?? []).map((row) => {
    const r = row as {
      id: string;
      amount_cents: number;
      status: string;
      paid_at: string | null;
      meta?: {
        attributed_cents?: number;
        below_minimum?: boolean;
        hold_release_at?: string;
        rule?: string;
      } | null;
      created_at: string;
      commission_pools?:
        | {
            period_key?: string;
            status?: string;
            allocation_rule?: string;
            creator_share_bps?: number;
            period_end?: string;
          }
        | {
            period_key?: string;
            status?: string;
            allocation_rule?: string;
            creator_share_bps?: number;
            period_end?: string;
          }[]
        | null;
    };
    const pool = Array.isArray(r.commission_pools) ? r.commission_pools[0] : r.commission_pools;
    const amount = Number(r.amount_cents ?? 0);
    if (r.status === 'paid') paid += amount;
    else if (r.status === 'void') voided += amount;
    else pending += amount;
    if (r.meta?.below_minimum) belowMin += 1;

    return {
      id: r.id,
      amount_cents: amount,
      status: r.status,
      paid_at: r.paid_at,
      attributed_cents: r.meta?.attributed_cents ?? null,
      below_minimum: Boolean(r.meta?.below_minimum),
      hold_release_at: r.meta?.hold_release_at ?? null,
      rule: r.meta?.rule ?? pool?.allocation_rule ?? null,
      period_key: pool?.period_key ?? null,
      pool_status: pool?.status ?? null,
      creator_share_bps: pool?.creator_share_bps ?? COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
      created_at: r.created_at,
    };
  });

  return NextResponse.json({
    tags: {
      ml_tracking_tag: (profile as { ml_tracking_tag?: string | null } | null)?.ml_tracking_tag ?? null,
      amazon_tracking_tag:
        (profile as { amazon_tracking_tag?: string | null } | null)?.amazon_tracking_tag ?? null,
    },
    summary: {
      pending_cents: pending,
      paid_cents: paid,
      void_cents: voided,
      below_minimum_count: belowMin,
    },
    policy: {
      creator_share_bps: COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
      min_payout_cents: COMMISSION_MIN_PAYOUT_CENTS,
      hold_days: COMMISSION_PAYOUT_HOLD_DAYS,
    },
    allocations: rows,
  });
}
