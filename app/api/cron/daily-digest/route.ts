import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { buildDailyHtml } from '@/lib/email/templates';

/** Cron: Top 10 del día. Secret por query ?secret=, cabecera x-cron-secret o Authorization: Bearer (Vercel lo envía si CRON_SECRET está definido) */
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

  const { data: offers, error: offersErr } = await supabase
    .from('ofertas_ranked_general')
    .select('id, title, price, original_price, store, offer_url')
    .or('status.eq.approved,status.eq.published')
    .or('expires_at.is.null,expires_at.gte.' + now.toISOString())
    .order('ranking_blend', { ascending: false })
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
  const subject = 'Top 10 ofertas del día — AVENTA';
  const html = buildDailyHtml(offers ?? [], baseUrl);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';
  let sent = 0;

  if (!key) {
    console.log('[daily-digest] RESEND_API_KEY not set, would send to', emails.length);
    return NextResponse.json({ ok: true, sent: 0 });
  }

  for (const email of emails) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: email, subject, html }),
      });
      if (res.ok) sent++;
      else console.error('[daily-digest] Resend', email, await res.text());
    } catch (e) {
      console.error('[daily-digest] send', email, e);
    }
  }
  return NextResponse.json({ ok: true, sent, recipients: emails.length });
}
