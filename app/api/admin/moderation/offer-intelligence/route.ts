import { NextResponse } from 'next/server';
import { requireModerationActor } from '@/lib/team/moderation/access';
import { createServerClient } from '@/lib/supabase/server';
import { assessIncomingOffer } from '@/lib/offers/duplicateIntelligence/assess';
import { DUPLICATE_ALGORITHM_VERSION } from '@/lib/offers/duplicateIntelligence/types';

export async function GET(request: Request) {
  const auth = await requireModerationActor(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const offerId = new URL(request.url).searchParams.get('offerId')?.trim() ?? '';
  if (!offerId) return NextResponse.json({ error: 'offer_required' }, { status: 400 });

  const supabase = createServerClient();
  const { assessment, incoming, candidate, retrieval } = await assessIncomingOffer(supabase, offerId);

  function offerView(row: typeof incoming) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      store: row.store,
      price: row.price,
      originalPrice: row.original_price,
      currency: row.source_currency ?? null,
      url: row.offer_url,
      createdAt: row.created_at,
      status: row.status,
    };
  }

  if (assessment.relation !== 'NO_MATCH') {
    await supabase.from('offer_match_observations').upsert(
      {
        offer_id: offerId,
        matched_offer_id: assessment.matchedOfferId,
        relation_type: assessment.relation,
        confidence: assessment.confidence,
        signals: assessment.signals,
        price_status: assessment.price?.status ?? 'unknown',
        algorithm_version: DUPLICATE_ALGORITHM_VERSION,
        detected_at: new Date().toISOString(),
      },
      { onConflict: 'offer_id,matched_offer_id,algorithm_version' },
    );
  }

  return NextResponse.json({
    retrieval,
    relation: assessment.relation,
    confidence: assessment.confidence,
    signals: assessment.signals,
    price: assessment.price
      ? {
          status: assessment.price.status,
          direction: assessment.price.status === 'compared' ? assessment.price.direction : null,
          percentage: assessment.price.status === 'compared' ? assessment.price.percentage : null,
          absoluteDifferenceMinor:
            assessment.price.status === 'compared' ? assessment.price.absoluteDifferenceMinor.toString() : null,
          reason: assessment.price.status === 'unknown' ? assessment.price.reason : null,
        }
      : null,
    algorithmVersion: assessment.algorithmVersion,
    incoming: offerView(incoming),
    candidate: offerView(candidate),
  });
}
