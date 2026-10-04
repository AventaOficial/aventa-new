import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { createServerClient } from '@/lib/supabase/server';
import { reconcileModerationTeamXp } from '@/lib/team/xp/rules/moderation';

/** Repite reglas de Team XP de eventos ya persistidos. Idempotente. */
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const { scanned, results } = await reconcileModerationTeamXp(createServerClient());
  const counts = { granted: 0, skipped: 0, duplicate: 0, failed: 0 };
  for (const result of results) counts[result.status] += 1;
  return NextResponse.json({ ok: true, scanned, ...counts });
}
