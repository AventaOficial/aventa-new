import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { getCommissionEligibility } from '@/lib/server/commissionEligibility';

/** GET: elegibilidad para activar comisiones. */
export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request);
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const eligibility = await getCommissionEligibility(supabase, user.id);
  return NextResponse.json(eligibility);
}
