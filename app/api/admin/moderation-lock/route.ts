import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { isModerationLockStale, MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

type LockAction = 'acquire' | 'release' | 'heartbeat';

/**
 * Lock colaborativo de oferta en moderación.
 * POST { offerId, action: 'acquire' | 'release' | 'heartbeat' }
 */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId : null;
  const action = (['acquire', 'release', 'heartbeat'] as const).includes(body?.action)
    ? (body.action as LockAction)
    : null;

  if (!offerId || !action) {
    return NextResponse.json({ error: 'offerId y action requeridos' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: row, error: readErr } = await supabase
    .from('offers')
    .select('id, status, locked_by, locked_at')
    .eq('id', offerId)
    .maybeSingle();

  if (readErr && hasMissingColumn(readErr, 'locked_by')) {
    return NextResponse.json({ ok: true, lockSupported: false });
  }
  if (readErr || !row) {
    return NextResponse.json({ error: readErr?.message ?? 'Oferta no encontrada' }, { status: 404 });
  }
  if ((row as { status?: string }).status !== 'pending') {
    return NextResponse.json({ error: 'La oferta ya no está pendiente' }, { status: 409 });
  }

  const lockedBy = (row as { locked_by?: string | null }).locked_by ?? null;
  const lockedAt = (row as { locked_at?: string | null }).locked_at ?? null;
  const nowIso = new Date().toISOString();

  if (action === 'release') {
    if (lockedBy && lockedBy !== auth.user.id) {
      return NextResponse.json({ ok: true, released: false });
    }
    const { error } = await supabase
      .from('offers')
      .update({ locked_by: null, locked_at: null })
      .eq('id', offerId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, released: true });
  }

  const blockedByOther =
    lockedBy && lockedBy !== auth.user.id && !isModerationLockStale(lockedAt);

  if (action === 'acquire' && blockedByOther) {
    const { data: lockerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', lockedBy)
      .maybeSingle();
    return NextResponse.json(
      {
        error: 'En revisión por otro moderador',
        lockedBy,
        lockedByName:
          (lockerProfile as { display_name?: string | null } | null)?.display_name?.trim() ||
          'Otro moderador',
        lockedAt,
      },
      { status: 409 }
    );
  }

  if (action === 'heartbeat' && blockedByOther) {
    return NextResponse.json({ error: 'Lock de otro moderador' }, { status: 409 });
  }

  const { error: upErr } = await supabase
    .from('offers')
    .update({ locked_by: auth.user.id, locked_at: nowIso })
    .eq('id', offerId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    lockSupported: true,
    lockedBy: auth.user.id,
    lockedAt: nowIso,
    staleMs: MODERATION_LOCK_STALE_MS,
  });
}
