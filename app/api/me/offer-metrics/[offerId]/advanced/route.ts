import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';

export type HourlyBucket = {
  hour: string;
  views: number;
  outbound: number;
  shares: number;
  cazar_cta: number;
};

/**
 * GET /api/me/offer-metrics/[offerId]/advanced
 * Serie horaria (últimos 7 días) + totales + progreso hacia partner.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId: rawId } = await params;
    const offerId = rawId?.trim();
    if (!offerId || !isValidUuid(offerId)) {
      return NextResponse.json({ error: 'offerId inválido' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'events');
    if (!rl.success) {
      return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return NextResponse.json({ error: 'Config error' }, { status: 500 });

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (!userRes.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const userData = await userRes.json().catch(() => null);
    const userId = userData?.id as string | undefined;
    if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const supabase = createServerClient();
    const { data: offer, error: offerErr } = await supabase
      .from('offers')
      .select('id, title, created_by, upvotes_count, status, created_at, expires_at')
      .eq('id', offerId)
      .single();

    if (offerErr || !offer || (offer as { created_by?: string }).created_by !== userId) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 });
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: evErr } = await supabase
      .from('offer_events')
      .select('event_type, created_at')
      .eq('offer_id', offerId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (evErr) {
      console.error('[offer-metrics-advanced]', evErr.message);
      return NextResponse.json({ error: 'No se pudieron leer métricas' }, { status: 500 });
    }

    const buckets = new Map<string, HourlyBucket>();
    const totals = { views: 0, outbound: 0, shares: 0, cazar_cta: 0 };

    for (const row of events ?? []) {
      const type = (row as { event_type: string }).event_type;
      const created = (row as { created_at: string }).created_at;
      if (!created) continue;
      const d = new Date(created);
      if (Number.isNaN(d.getTime())) continue;
      // Truncar a hora UTC ISO (YYYY-MM-DDTHH:00:00.000Z)
      const hourKey = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours())
      ).toISOString();

      let bucket = buckets.get(hourKey);
      if (!bucket) {
        bucket = { hour: hourKey, views: 0, outbound: 0, shares: 0, cazar_cta: 0 };
        buckets.set(hourKey, bucket);
      }

      if (type === 'view') {
        bucket.views += 1;
        totals.views += 1;
      } else if (type === 'outbound') {
        bucket.outbound += 1;
        totals.outbound += 1;
      } else if (type === 'share') {
        bucket.shares += 1;
        totals.shares += 1;
      } else if (type === 'cazar_cta') {
        bucket.cazar_cta += 1;
        totals.cazar_cta += 1;
      }
    }

    const hourly = [...buckets.values()].sort((a, b) => a.hour.localeCompare(b.hour));

    // Hora pico de vistas
    let peakHour: string | null = null;
    let peakViews = 0;
    for (const b of hourly) {
      if (b.views > peakViews) {
        peakViews = b.views;
        peakHour = b.hour;
      }
    }

    // Progreso partner (misma regla que commission eligibility)
    const { COMMISSION_REQUIRED_OFFERS, COMMISSION_MIN_UPVOTES_PER_OFFER } = await import(
      '@/lib/commissions/constants'
    );
    const { data: myOffers } = await supabase
      .from('offers')
      .select('id, upvotes_count')
      .eq('created_by', userId)
      .in('status', ['approved', 'published']);

    const qualifying = (myOffers ?? []).filter(
      (o: { upvotes_count?: number | null }) =>
        (o.upvotes_count ?? 0) >= COMMISSION_MIN_UPVOTES_PER_OFFER
    ).length;

    const offerRow = offer as {
      title: string;
      upvotes_count?: number | null;
      status?: string;
      created_at?: string;
      expires_at?: string | null;
    };

    return NextResponse.json({
      offer: {
        id: offerId,
        title: offerRow.title,
        upvotes: offerRow.upvotes_count ?? 0,
        status: offerRow.status,
        created_at: offerRow.created_at,
        expires_at: offerRow.expires_at ?? null,
      },
      periodDays: 7,
      totals,
      hourly,
      peak: peakHour ? { hour: peakHour, views: peakViews } : null,
      partner: {
        qualifyingCount: qualifying,
        requiredOffers: COMMISSION_REQUIRED_OFFERS,
        minUpvotesPerOffer: COMMISSION_MIN_UPVOTES_PER_OFFER,
        thisOfferQualifies: (offerRow.upvotes_count ?? 0) >= COMMISSION_MIN_UPVOTES_PER_OFFER,
        remainingForThisOffer: Math.max(
          0,
          COMMISSION_MIN_UPVOTES_PER_OFFER - (offerRow.upvotes_count ?? 0)
        ),
        remainingOffers: Math.max(0, COMMISSION_REQUIRED_OFFERS - qualifying),
      },
    });
  } catch (e) {
    console.error('[offer-metrics-advanced]', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
