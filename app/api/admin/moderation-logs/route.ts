import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';

export type ModerationLogRow = {
  id: string;
  offer_id: string;
  user_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  created_at: string;
  display_name?: string | null;
};

/** GET ?offerId=xxx — historial de moderación de una oferta (solo mods). */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const offerId = searchParams.get('offerId')?.trim();
  if (!offerId) {
    return NextResponse.json({ error: 'offerId obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('moderation_logs')
    .select('id, offer_id, user_id, action, previous_status, new_status, reason, created_at')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ logs: [] });
  }

  const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
  let names: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    if (profiles) {
      names = Object.fromEntries(profiles.map((p: { id: string; display_name: string | null }) => [p.id, p.display_name]));
    }
  }

  const logs: ModerationLogRow[] = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    display_name: names[r.user_id as string] ?? null,
  })) as ModerationLogRow[];

  return NextResponse.json({ logs });
}
