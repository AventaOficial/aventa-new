import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import { computeModerationTrust, parseBotIngestScore } from '@/lib/moderation/confidenceBadge';
import { isModerationLockStale } from '@/lib/moderation/moderationLock';

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

/**
 * GET ?since=ISO — resumen desde la última sesión del moderador.
 */
export async function GET(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get('since');
  const sinceDate = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceIso = Number.isFinite(sinceDate.getTime())
    ? sinceDate.toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const supabase = createServerClient();

  const { data: offers, error: offersErr } = await supabase
    .from('offers')
    .select(
      'id, title, created_at, risk_score, moderator_comment, image_url, category, original_price, price'
    )
    .eq('status', 'pending')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(200);

  if (offersErr) {
    return NextResponse.json({ error: offersErr.message }, { status: 500 });
  }

  const newOffers = offers?.length ?? 0;
  let lowTrust = 0;
  for (const o of offers ?? []) {
    const trust = computeModerationTrust({
      risk_score: o.risk_score,
      moderator_comment: o.moderator_comment,
      image_url: o.image_url,
      category: o.category,
      original_price: o.original_price,
      price: o.price,
      is_bot: parseBotIngestScore(o.moderator_comment) != null,
    });
    if (trust.level === 'low') lowTrust++;
  }

  const { count: reportsCount, error: reportsErr } = await supabase
    .from('offer_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('created_at', sinceIso);

  if (reportsErr && !reportsErr.message.includes('offer_reports')) {
    return NextResponse.json({ error: reportsErr.message }, { status: 500 });
  }

  let lockedNow = 0;
  const { data: lockedRows, error: lockErr } = await supabase
    .from('offers')
    .select('locked_by, locked_at')
    .eq('status', 'pending')
    .not('locked_by', 'is', null);

  if (!lockErr || !hasMissingColumn(lockErr, 'locked_by')) {
    for (const r of lockedRows ?? []) {
      if (!isModerationLockStale((r as { locked_at?: string | null }).locked_at)) {
        lockedNow++;
      }
    }
  }

  return NextResponse.json({
    since: sinceIso,
    newOffers,
    lowTrustOffers: lowTrust,
    newReports: reportsCount ?? 0,
    lockedNow,
  });
}
