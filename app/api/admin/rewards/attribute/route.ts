import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { assignManualLedgerAttribution } from '@/lib/rewards/manualAttribution';
import { isValidUuid } from '@/lib/server/validateUuid';

/** POST: atribución manual staff (offer_id → creator verificado server-side). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const ledgerEntryId =
    typeof body?.ledger_entry_id === 'string' ? body.ledger_entry_id.trim() : '';
  const offerId = typeof body?.offer_id === 'string' ? body.offer_id.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;

  if (!ledgerEntryId || !isValidUuid(ledgerEntryId)) {
    return NextResponse.json({ error: 'ledger_entry_id inválido' }, { status: 400 });
  }
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offer_id inválido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await assignManualLedgerAttribution(supabase, {
    ledgerEntryId,
    offerId,
    actorId: auth.user.id,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, rewardId: result.rewardId });
}
