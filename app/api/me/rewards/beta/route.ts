import { NextResponse } from 'next/server';
import { appendBetaMembership } from '@/lib/rewards/betaCohortStore';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';

/** La persona invitada activa Rewards. No crea una recompensa ni un pago. */
export async function POST(request: Request) {
  const auth = await requireBearerMeUser(request, { mutate: true });
  if ('error' in auth) return meAuthFailureResponse(auth);
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Activó Rewards en la beta.';
  const saved = await appendBetaMembership(auth.supabase, {
    userId: auth.user.id,
    action: 'enroll',
    reason,
    actedBy: auth.user.id,
  });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 409 });
  return NextResponse.json({ membership: saved.membership, unchanged: saved.unchanged });
}
