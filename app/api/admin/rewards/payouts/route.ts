import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createManualRewardPayout } from '@/lib/rewards/payout';
import { isValidUuid } from '@/lib/server/validateUuid';

/** POST: registrar pago SPEI manual de recompensas AVAILABLE. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : '';
  const amountCents = Number(body?.amount_cents);
  const speiReference = typeof body?.spei_reference === 'string' ? body.spei_reference : '';
  const notes = typeof body?.notes === 'string' ? body.notes : null;
  const rewardIds = Array.isArray(body?.reward_ids)
    ? body.reward_ids.filter((id: unknown) => typeof id === 'string' && isValidUuid(id))
    : undefined;

  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ error: 'user_id inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await createManualRewardPayout(supabase, {
    userId,
    amountCents,
    speiReference,
    notes,
    createdBy: auth.user.id,
    rewardIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    payoutId: result.payoutId,
    paidRewardIds: result.paidRewardIds,
  });
}
