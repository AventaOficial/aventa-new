import { NextResponse } from 'next/server';
import { REWARDS_BETA_STATUSES, type RewardsBetaAction } from '@/lib/rewards/betaCohort';
import { appendBetaMembership, latestBetaMembership } from '@/lib/rewards/betaCohortStore';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ['invite', 'suspend', 'remove', 'reenroll'] as const;

/**
 * Alta y baja de la cohorte. El rol de quien opera no concede Rewards:
 * solo escribe una fila de membresía para otro usuario.
 */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
    action?: unknown;
    reason?: unknown;
  } | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const action = typeof body?.action === 'string' ? body.action : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!UUID.test(userId)) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: 'Falta el motivo.' }, { status: 400 });
  const saved = await appendBetaMembership(createServerClient(), {
    userId,
    action: action as RewardsBetaAction,
    reason,
    actedBy: auth.user.id,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });
  return NextResponse.json({ membership: saved.membership });
}

export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? '';
  if (!UUID.test(userId)) return NextResponse.json({ error: 'Usuario inválido.' }, { status: 400 });
  const membership = await latestBetaMembership(createServerClient(), userId);
  return NextResponse.json({
    membership,
    statuses: REWARDS_BETA_STATUSES,
  });
}
