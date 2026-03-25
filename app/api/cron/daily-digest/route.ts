import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildDailyHtml } from '@/lib/email/templates';
import { runWithConcurrency } from '@/lib/server/runWithConcurrency';
import { formatZonedDayLabel, getZonedDayRange } from '@/lib/server/digestDay';

const RESEND_CONCURRENCY = 12;
const TZ = process.env.DIGEST_TIMEZONE || 'America/Mexico_City';

/**
 * Cron nocturno: mejores ofertas del día civil (zona DIGEST_TIMEZONE, default México).
 * Programar ~19:00–20:00 hora local: en vercel.json 0 1 * * * ≈ 19:00 CDMX (UTC-6).
 * Secret: ?secret=, x-cron-secret o Authorization: Bearer CRON_SECRET
 */
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
  const { start, end } = getZonedDayRange(now, TZ);
  const dayLabel = formatZonedDayLabel(start, TZ);

  const { data: offers, error: offersErr } = await supabase
    .from('offers')
    .select('id, title, price, original_price, store, offer_url, image_url, created_by, created_at, upvotes_count')
    .in('status', ['approved', 'published'])
    .or('expires_at.is.null,expires_at.gte.' + now.toISOString())
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .order('upvotes_count', { ascending: false, nullsFirst: false })
    .limit(10);

  if (offersErr) {
    console.error('[daily-digest] offers:', offersErr.message);
    return NextResponse.json({ error: 'Error loading offers' }, { status: 500 });
  }

  const { data: prefs } = await supabase
    .from('user_email_preferences')
    .select('user_id, email')
    .eq('email_daily_digest', true)
    .not('email', 'is', null);

  const recipients = (prefs ?? []) as { user_id: string; email: string }[];
  const emails = recipients.map((r) => r.email).filter(Boolean);

  if (emails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No recipients' });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com';
  const subject = `Mejores ofertas de hoy — AVENTA (${dayLabel})`;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';
  let sent = 0;

  if (!key) {
    console.log('[daily-digest] RESEND_API_KEY not set, would send to', emails.length);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const offerList = (offers ?? []) as { id: string; title: string; created_by?: string | null }[];

  const tasks = recipients
    .filter((r): r is { user_id: string; email: string } => Boolean(r.email?.trim()))
    .map((r) => async () => {
      const email = r.email.trim();
      const yourOffersInTop = offerList
        .filter((o) => o.created_by === r.user_id)
        .map((o) => ({ id: o.id, title: o.title }));
      const html = buildDailyHtml(offerList as Parameters<typeof buildDailyHtml>[0], baseUrl, yourOffersInTop.length > 0 ? yourOffersInTop : undefined, {
        title: 'Mejores ofertas de hoy',
        preheader: `Resumen del ${dayLabel}. Las más apoyadas por la comunidad.`,
        dayLabel,
      });
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: email, subject, html }),
        });
        if (res.ok) return true;
        console.error('[daily-digest] Resend', email, await res.text());
      } catch (e) {
        console.error('[daily-digest] send', email, e);
      }
      return false;
    });

  const results = await runWithConcurrency(tasks, RESEND_CONCURRENCY);
  sent = results.filter(Boolean).length;

  return NextResponse.json({ ok: true, sent, recipients: emails.length, window: { start: start.toISOString(), end: end.toISOString(), tz: TZ } });
}
