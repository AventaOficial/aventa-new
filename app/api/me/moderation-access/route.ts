import { NextResponse } from 'next/server';
import { requireModerationActor } from '@/lib/team/moderation/access';

/** El cliente no envía el rol. La sesión decide si puede moderar. */
export async function GET(request: Request) {
  const auth = await requireModerationActor(request);
  if ('error' in auth) {
    return NextResponse.json({ canModerate: false });
  }
  return NextResponse.json({ canModerate: true });
}
