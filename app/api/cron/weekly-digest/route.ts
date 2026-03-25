import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildWeeklyHtml, type WeeklyDayBlock } from '@/lib/email/templates';
import { runWithConcurrency } from '@/lib/server/runWithConcurrency';
import { formatZonedDayLabel, getZonedDayRange, zonedCalendarKey } from '@/lib/server/digestDay';

const RESEND_CONCURRENCY = 12;
const TZ = process.env.DIGEST_TIMEZONE || 'America/Mexico_City';

type OfferDigestRow = {
  id: string;
  title: string;
  price?: number;
  original_price?: number | null;
  store?: string | null;
  offer_url?: string | null;
  image_url?: string | null;
  created_at: string;
  upvotes_count?: number | null;
  created_by?: string | null;
  comments?: { count: number }[];
};

/** Cron: resumen semanal — top 3 por cada uno de los últimos 7 días (zona DIGEST_TIMEZONE) + más comentadas + cazadores. */
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
  const now = new Date();

  const rangeMeta: { start: Date; end: Date; label: string; key: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const ref = new Date(now.getTime() - i * 86400000);
    const { start, end } = getZonedDayRange(ref, TZ);
    const key = zonedCalendarKey(start, TZ);
    const label = formatZonedDayLabel(start, TZ);
    rangeMeta.push({ start, end, label, key });
  }

  const minStart = rangeMeta[0].start;
  const maxEnd = rangeMeta[rangeMeta.length - 1].end;

  const { data: offersInWeek, error: weekErr } = await supabase
    .from('offers')
    .select('id, title, price, original_price, store, offer_url, image_url, created_at, upvotes_count, created_by')
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`)
    .gte('created_at', minStart.toISOString())
    .lt('created_at', maxEnd.toISOString());

  if (weekErr) {
    console.error('[weekly-digest] offers:', weekErr.message);
    return NextResponse.json({ error: 'Error loading offers' }, { status: 500 });
  }

  const keyOrder = rangeMeta.map((r) => r.key);
  const byKey = new Map<string, OfferDigestRow[]>();
  for (const k of keyOrder) byKey.set(k, []);

  for (const o of (offersInWeek ?? []) as OfferDigestRow[]) {
    const ca = o.created_at;
    if (!ca) continue;
    const key = zonedCalendarKey(new Date(ca), TZ);
    const list = byKey.get(key);
    if (list) list.push(o);
  }

  const dayBlocks: WeeklyDayBlock[] = rangeMeta.map((r) => {
    const list = (byKey.get(r.key) ?? [])
      .sort((a, b) => (b.upvotes_count ?? 0) - (a.upvotes_count ?? 0))
      .slice(0, 3);
    return { dayLabel: r.label, offers: list };
  });

  const weekAgoIso = minStart.toISOString();

  const { data: offersWithComments } = await supabase
    .from('offers')
    .select(
      `
      id,
      title,
      price,
      original_price,
      store,
      comments(count)
    `
    )
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`)
    .gte('created_at', weekAgoIso);

  type WithCc = {
    id: string;
    title: string;
    price?: number;
    store?: string | null;
    commentCount: number;
  };
  const withCommentCount: WithCc[] = (offersWithComments ?? []).map((o: Record<string, unknown>) => ({
    id: String(o.id ?? ''),
    title: String(o.title ?? ''),
    price: typeof o.price === 'number' ? o.price : undefined,
    store: (o.store as string | null) ?? null,
    commentCount: (o.comments as { count: number }[])?.[0]?.count ?? 0,
  }));
  const topCommented = [...withCommentCount]
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 3)
    .map((o) => ({
      id: o.id,
      title: o.title,
      price: o.price,
      store: o.store,
    }));

  const { data: topVotedRaw } = await supabase
    .from('offers')
    .select('id, title, price, original_price, store, created_by')
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`)
    .gte('created_at', weekAgoIso)
    .order('upvotes_count', { ascending: false })
    .limit(15);

  type TopVotedRow = { id: string; title: string; price?: number; original_price?: number | null; store?: string | null; created_by?: string | null };
  const rawList = (topVotedRaw ?? []) as TopVotedRow[];
  const counts = rawList.reduce(
    (acc: Record<string, number>, o) => {
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
  const html = buildWeeklyHtml(dayBlocks, topCommented, baseUrl, topHunters);

  let sent = 0;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';

  if (!key) {
    console.log('[weekly-digest] RESEND_API_KEY not set, would send to', emails.length);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const tasks = emails.map(
    (email) => async () => {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: email, subject, html }),
        });
        return res.ok;
      } catch (e) {
        console.error('[weekly-digest] send error', email, e);
        return false;
      }
    }
  );

  const results = await runWithConcurrency(tasks, RESEND_CONCURRENCY);
  sent = results.filter(Boolean).length;

  return NextResponse.json({ ok: true, sent, recipients: emails.length });
}
