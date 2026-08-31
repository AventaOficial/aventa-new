import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  cancelReward,
  processExpiredRewardHolds,
  reverseReward,
} from '@/lib/rewards/rewardsEngine';

function hasMissingTable(error: { message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes('creator_rewards') || m.includes('does not exist');
}

/** GET: listado de recompensas (staff owner/admin). */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const status = url.searchParams.get('status')?.trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));

  const supabase = createServerClient();
  let q = supabase
    .from('creator_rewards')
    .select(
      'id, creator_id, offer_id, ledger_entry_id, network, gross_commission_cents, creator_share_cents, platform_share_cents, status, hold_until, available_at, paid_at, cancelled_at, reversed_at, attribution_method, attribution_confidence, fraud_flags, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) {
    if (hasMissingTable(error)) {
      return NextResponse.json(
        { rewards: [], error: 'Ejecuta docs/supabase-migrations/20260830_rewards_v1.sql' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo listar recompensas' }, { status: 500 });
  }

  return NextResponse.json({ rewards: data ?? [] });
}

/** PATCH: cancelar o revertir recompensa. */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const action = body?.action === 'cancel' || body?.action === 'reverse' ? body.action : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  if (!id || !action) {
    return NextResponse.json({ error: 'id y action requeridos' }, { status: 400 });
  }

  const supabase = createServerClient();
  const ok =
    action === 'cancel'
      ? await cancelReward(supabase, id, auth.user.id, reason || 'staff_cancel')
      : await (async () => {
          const { data: row } = await supabase
            .from('creator_rewards')
            .select('status')
            .eq('id', id)
            .maybeSingle();
          if ((row as { status?: string } | null)?.status === 'PAID') {
            return null;
          }
          return reverseReward(supabase, id, auth.user.id, reason || 'staff_reverse');
        })();

  if (ok === null) {
    return NextResponse.json(
      {
        error:
          'Recompensa PAID no puede revertirse directamente. Usa POST /api/admin/rewards/clawback',
      },
      { status: 400 },
    );
  }

  if (!ok) {
    return NextResponse.json({ error: 'No se pudo actualizar la recompensa' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/** POST: procesar holds vencidos. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  if (body?.action !== 'process_holds') {
    return NextResponse.json({ error: 'action=process_holds requerido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await processExpiredRewardHolds(supabase);
  return NextResponse.json({ ok: true, ...result });
}
