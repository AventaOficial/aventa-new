import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildWeeklyHtml } from '@/lib/email/templates';

/** Cron: resumen semanal (domingos). Secret por query, x-cron-secret o Authorization: Bearer (Vercel) */
export async function GET(request: NextRequest) {
  const fromQuery = request.nextUrl.searchParams.get('secret');
  const fromHeader = request.headers.get('x-cron-secret');
  const authHeader = request.headers.get('authorization');
  const fromBearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const secret = fromQuery ?? fromHeader ?? fromBearer ?? '';
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoIso = weekAgo.toISOString();

  const { data: offersWithComments } = await supabase
    .from('offers')
    .select(`
      id,
      title,
      price,
      original_price,
      store,
      comments(count)
    `)
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .gte('created_at', weekAgoIso);

  const withCommentCount = (offersWithComments ?? []).map((o: { id: string; title: string; price?: number; original_price?: number | null; store?: string | null; comments?: { count: number }[] }) => ({
    ...o,
    commentCount: (o.comments as { count: number }[])?.[0]?.count ?? 0,
  }));
  const topCommented = [...withCommentCount]
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 3);

  const { data: topVotedRaw } = await supabase
    .from('offers')
    .select('id, title, price, original_price, store, created_by')
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .gte('created_at', weekAgoIso)
    .order('upvotes_count', { ascending: false })
    .limit(5);

  const topVoted = (topVotedRaw ?? []).map((o: { created_by?: string | null }) => ({
    id: o.id,
    title: (o as { title: string }).title,
    price: (o as { price?: number }).price,
    original_price: (o as { original_price?: number | null }).original_price,
    store: (o as { store?: string | null }).store,
  }));

  const createdByIds = [...new Set((topVotedRaw ?? []).map((o: { created_by?: string | null }) => o.created_by).filter(Boolean))] as string[];
  const counts = (topVotedRaw ?? []).reduce(
    (acc: Record<string, number>, o: { created_by?: string | null }) => {
      const id = o.created_by ?? '';
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const top3CreatorIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
  const { data: topHunterProfiles } =
    top3CreatorIds.length > 0
      ? await supabase.from('profiles').select('id, display_name, slug').in('id', top3CreatorIds)
      : { data: [] };
  const topHunters = (topHunterProfiles ?? []).map((p: { display_name?: string | null; slug?: string | null }) => ({
    display_name: (p.display_name ?? 'Cazador').trim() || 'Cazador',
    slug: p.slug?.trim() || null,
  }));

  const { data: prefs } = await supabase
    .from('user_email_preferences')
    .select('user_id, email')
    .eq('email_weekly_digest', true)
    .not('email', 'is', null);

  const recipients = (prefs ?? []) as { user_id: string; email: string }[];
  const emails = recipients.map((r) => r.email).filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No recipients' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';
  const subject = `Resumen semanal — AVENTA`;
  const html = buildWeeklyHtml(
    topCommented as { id: string; title: string; price?: number; store?: string | null }[],
    topVoted,
    baseUrl,
    topHunters
  );

  let sent = 0;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';

  if (!key) {
    console.log('[weekly-digest] RESEND_API_KEY not set, would send to', emails.length);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  for (const email of emails) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: email, subject, html }),
      });
      if (res.ok) sent++;
    } catch (e) {
      console.error('[weekly-digest] send error', email, e);
    }
  }

  return NextResponse.json({ ok: true, sent, recipients: emails.length });
}
