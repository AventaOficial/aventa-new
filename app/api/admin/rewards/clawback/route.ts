import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { createPaidRewardClawbackAdjustment } from '@/lib/rewards/clawback';
import { isValidUuid } from '@/lib/server/validateUuid';

/** POST: clawback/ajuste pendiente sobre reward PAID (no revierte PAID silenciosamente). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const rewardId = typeof body?.reward_id === 'string' ? body.reward_id.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const ledgerEntryId =
    typeof body?.ledger_entry_id === 'string' ? body.ledger_entry_id.trim() : undefined;
  const speiRef =
    typeof body?.spei_clawback_reference === 'string' ? body.spei_clawback_reference : undefined;

  if (!rewardId || !isValidUuid(rewardId)) {
    return NextResponse.json({ error: 'reward_id inválido' }, { status: 400 });
  }
  if (ledgerEntryId && !isValidUuid(ledgerEntryId)) {
    return NextResponse.json({ error: 'ledger_entry_id inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await createPaidRewardClawbackAdjustment(supabase, {
    rewardId,
    actorId: auth.user.id,
    reason,
    ledgerEntryId,
    speiClawbackReference: speiRef,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, adjustmentId: result.adjustmentId });
}
