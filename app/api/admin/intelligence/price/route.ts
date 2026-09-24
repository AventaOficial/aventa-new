import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { createServerClient } from '@/lib/supabase/server';
import {
  readOfferPriceObservations,
  readPriceMemoryObservations,
} from '@/lib/dealIntelligence/readers/canonicalRead';
import { pointsFromObservations } from '@/lib/intelligence/price/fromObservations';
import { priceRollupKey, summarizePricePoints } from '@/lib/intelligence/price/summarize';
import { PRICE_POINT_READ_MAX_ROWS, PRICE_WINDOWS_DAYS } from '@/lib/intelligence/scale';

async function readKnowledge(offerId: string | null, productId: string | null) {
  const supabase = createServerClient();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const read = offerId
    ? await readOfferPriceObservations(supabase, {
        offerId,
        sinceIso: since.toISOString(),
        limit: PRICE_POINT_READ_MAX_ROWS,
        currencyHint: 'MXN',
      })
    : await readPriceMemoryObservations(supabase, {
        productId: productId ?? undefined,
        sinceYmd: since.toISOString().slice(0, 10),
        limit: PRICE_POINT_READ_MAX_ROWS,
      });
  return { supabase, read };
}

export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const offerId = url.searchParams.get('offerId')?.trim() || null;
  const productId = url.searchParams.get('productId')?.trim() || null;
  if (!offerId && !productId) {
    return NextResponse.json({ error: 'offerId or productId required' }, { status: 400 });
  }

  const { read } = await readKnowledge(offerId, productId);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 503 });

  const knowledge = summarizePricePoints({ points: pointsFromObservations(read.observations) });
  return NextResponse.json({
    subject: offerId ? { type: 'offer', id: offerId } : { type: 'product', id: productId },
    knowledge,
    currencyAssumption: offerId ? 'MXN_hint_offer_snapshots_have_no_currency_column' : 'row_currency',
    readLatencyMs: read.latencyMs,
    publicationAllowed: false,
  });
}

export async function POST(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as {
    offerId?: string;
    productId?: string;
    windowDays?: number;
  } | null;
  const offerId = body?.offerId?.trim() || null;
  const productId = body?.productId?.trim() || null;
  const windowDays = body?.windowDays ?? 90;
  if ((!offerId && !productId) || !PRICE_WINDOWS_DAYS.includes(windowDays as (typeof PRICE_WINDOWS_DAYS)[number])) {
    return NextResponse.json({ error: 'offerId or productId, and windowDays 7|30|90' }, { status: 400 });
  }

  const { supabase, read } = await readKnowledge(offerId, productId);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 503 });
  const knowledge = summarizePricePoints({ points: pointsFromObservations(read.observations) });
  if (knowledge.notes.some((note) => note.startsWith('currency_mixed'))) {
    return NextResponse.json({ error: 'currency_mixed', knowledge }, { status: 422 });
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const subjectType = offerId ? 'offer' : 'product';
  const subjectKey = offerId ?? productId ?? '';
  const { error } = await supabase.from('price_intelligence_rollups').upsert(
    {
      idempotency_key: priceRollupKey({ subjectType, subjectKey, windowDays, asOfDate }),
      subject_type: subjectType,
      subject_key: subjectKey,
      window_days: windowDays,
      as_of_date: asOfDate,
      currency: knowledge.currency,
      sample_count: knowledge.evidence.samples,
      current_price: knowledge.current,
      min_price: knowledge.min,
      max_price: knowledge.max,
      median_price: knowledge.median,
      trend: knowledge.trend,
      volatility: knowledge.volatility,
      confidence: knowledge.confidence,
      latest_observed_at: knowledge.evidence.latestObservedAt,
    },
    { onConflict: 'idempotency_key' },
  );

  if (error) {
    return NextResponse.json({ error: 'migration_pending', detail: error.message, knowledge }, { status: 503 });
  }
  return NextResponse.json({ stored: true, publicationAllowed: false, knowledge });
}
