import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/server/requireAdmin';
import { releaseStaleModerationLocks } from '@/lib/moderation/releaseStaleLocks';

/**
 * POST — libera locks stale (lease expirado) y audita.
 * Solo owner/admin (ops). Moderadores normales no force-reclaim.
 * Body opcional: { limit?: number }
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limitRaw = typeof body?.limit === 'number' ? body.limit : 200;
    const limit = Math.max(1, Math.min(500, Math.floor(limitRaw)));

    const supabase = createServerClient();
    const result = await releaseStaleModerationLocks(supabase, {
      limit,
      actorUserId: auth.user.id,
    });

    return NextResponse.json({
      ok: true,
      released: result.released,
      audited: result.audited,
      offerIds: result.offerIds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudo reclaim';
    console.error('[moderation/reclaim-stale]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
