import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

const ALLOWED_MINUTES = [15, 60, 240] as const;

/**
 * POST { offerId, minutes: 15 | 60 | 240 }
 */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const offerId = typeof body?.offerId === 'string' ? body.offerId : null;
  const minutesRaw = Number.parseInt(String(body?.minutes ?? ''), 10);
  const minutes = (ALLOWED_MINUTES as readonly number[]).includes(minutesRaw) ? minutesRaw : 60;

  if (!offerId) {
    return NextResponse.json({ error: 'offerId requerido' }, { status: 400 });
  }

  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const supabase = createServerClient();

  const { error } = await supabase
    .from('offers')
    .update({
      snoozed_until: until,
      locked_by: null,
      locked_at: null,
    })
    .eq('id', offerId)
    .eq('status', 'pending');

  if (error && hasMissingColumn(error, 'snoozed_until')) {
    return NextResponse.json(
      { error: 'Snooze no disponible: aplica la migración offers_moderation_lock_snooze.sql' },
      { status: 501 }
    );
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snoozedUntil: until, minutes });
}
