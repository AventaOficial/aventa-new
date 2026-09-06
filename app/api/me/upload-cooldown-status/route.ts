import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { getUploadCooldownStatus } from '@/lib/server/uploadCooldown';

export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request);
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const status = await getUploadCooldownStatus(supabase, user);
  return NextResponse.json(status);
}
