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

const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 100;

/** GET: logs de moderación (solo owner/admin), paginados. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LOG_LIMIT), 10) || DEFAULT_LOG_LIMIT;
  const limit = Math.min(MAX_LOG_LIMIT, Math.max(1, limitRaw));
  const offset = (page - 1) * limit;
  const rangeEnd = offset + limit - 1;

  const supabase = createServerClient();
  const { data: rows, error, count } = await supabase
    .from('moderation_logs')
    .select('id, offer_id, user_id, action, previous_status, new_status, reason, metadata, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, rangeEnd);

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

  return NextResponse.json({ logs, total: count ?? 0, page, limit });
}
