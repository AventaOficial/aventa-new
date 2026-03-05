import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';

export type AdminLogRow = {
  id: string;
  offer_id: string | null;
  user_id: string | null;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  display_name: string | null;
  offer_title: string | null;
};

/** GET: últimos logs de moderación (solo owner/admin). Sin paginación, límite 200. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('moderation_logs')
    .select('id, offer_id, user_id, action, previous_status, new_status, reason, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (rows ?? []) as Array<Record<string, unknown> & { offer_id: string | null; user_id: string | null }>;
  const userIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
  const offerIds = [...new Set(list.map((r) => r.offer_id).filter(Boolean))] as string[];

  let names: Record<string, string | null> = {};
  let titles: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
    if (profiles) names = Object.fromEntries((profiles as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]));
  }
  if (offerIds.length > 0) {
    const { data: offers } = await supabase.from('offers').select('id, title').in('id', offerIds);
    if (offers) titles = Object.fromEntries((offers as { id: string; title: string }[]).map((o) => [o.id, o.title]));
  }

  const logs: AdminLogRow[] = list.map((r) => ({
    id: r.id as string,
    offer_id: r.offer_id ?? null,
    user_id: r.user_id ?? null,
    action: (r.action as string) ?? '',
    previous_status: (r.previous_status as string) ?? null,
    new_status: (r.new_status as string) ?? null,
    reason: (r.reason as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? null,
    created_at: (r.created_at as string) ?? '',
    display_name: r.user_id ? (names[r.user_id] ?? null) : null,
    offer_title: r.offer_id ? (titles[r.offer_id] ?? null) : null,
  }));

  return NextResponse.json({ logs });
}
