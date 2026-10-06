import type { SupabaseClient } from '@supabase/supabase-js';
import { identityFromOffer } from './identity';
import { classifyOfferMatch, type OfferSnapshot } from './classify';
import type { DuplicateAssessment } from './types';

const CANDIDATE_LIMIT = 8;

type OfferRow = {
  id: string;
  title: string | null;
  offer_url: string | null;
  price: number | null;
  original_price: number | null;
  store: string | null;
  source_currency?: string | null;
  status: string | null;
  created_at: string | null;
};

function snapshot(row: OfferRow): OfferSnapshot {
  return {
    id: row.id,
    title: row.title,
    offerUrl: row.offer_url,
    price: row.price,
    currency: row.source_currency ?? null,
  };
}

const OFFER_COLUMNS =
  'id, title, offer_url, price, original_price, store, status, created_at, source_currency, product_fingerprint';
const OFFER_COLUMNS_WITHOUT_CURRENCY =
  'id, title, offer_url, price, original_price, store, status, created_at, product_fingerprint';

async function rowsByFingerprint(
  supabase: SupabaseClient,
  key: string,
  excludeId: string,
): Promise<{ rows: OfferRow[]; unavailable: boolean }> {
  const primary = await supabase
    .from('offers')
    .select(OFFER_COLUMNS)
    .eq('product_fingerprint', key)
    .neq('id', excludeId)
    .limit(CANDIDATE_LIMIT);
  if (!primary.error) return { rows: (primary.data ?? []) as OfferRow[], unavailable: false };
  const fallback = await supabase
    .from('offers')
    .select(OFFER_COLUMNS_WITHOUT_CURRENCY)
    .eq('product_fingerprint', key)
    .neq('id', excludeId)
    .limit(CANDIDATE_LIMIT);
  if (fallback.error) return { rows: [], unavailable: true };
  return { rows: (fallback.data ?? []) as OfferRow[], unavailable: false };
}

export async function ensureOfferIdentity(
  supabase: SupabaseClient,
  offer: OfferSnapshot,
): Promise<void> {
  const identity = identityFromOffer({ offerUrl: offer.offerUrl, title: offer.title });
  if (!identity.key || identity.strength === 'none') return;
  await supabase.from('offer_product_identities').upsert(
    {
      offer_id: offer.id,
      identity_key: identity.key,
      identity_strength: identity.strength,
      variant_token: identity.variant,
      algorithm_version: 'duplicate-intelligence-v1',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'offer_id' },
  );
}

/**
 * Busca candidatos por identidad indexada. No recorre la tabla de ofertas.
 */
export async function assessIncomingOffer(
  supabase: SupabaseClient,
  offerId: string,
): Promise<{
  assessment: DuplicateAssessment;
  incoming: OfferRow | null;
  candidate: OfferRow | null;
  retrieval: 'ok' | 'unavailable';
}> {
  const { data, error } = await supabase
    .from('offers')
    .select(OFFER_COLUMNS)
    .eq('id', offerId)
    .maybeSingle();
  const row = (error ? null : data) as OfferRow | null;
  let incomingRow = row;
  if (!incomingRow) {
    const fallback = await supabase
      .from('offers')
      .select(OFFER_COLUMNS_WITHOUT_CURRENCY)
      .eq('id', offerId)
      .maybeSingle();
    incomingRow = (fallback.data ?? null) as OfferRow | null;
  }
  if (!incomingRow) {
    return {
      assessment: classifyOfferMatch({
        incoming: { id: offerId, title: null, offerUrl: null, price: null, currency: null },
        candidate: null,
      }),
      incoming: null,
      candidate: null,
      retrieval: 'unavailable',
    };
  }

  const incoming = snapshot(incomingRow);
  await ensureOfferIdentity(supabase, incoming);
  const identity = identityFromOffer({ offerUrl: incoming.offerUrl, title: incoming.title });
  if (!identity.key || identity.strength === 'none') {
    return {
      assessment: classifyOfferMatch({ incoming, candidate: null }),
      incoming: incomingRow,
      candidate: null,
      retrieval: 'ok',
    };
  }

  const { rows: candidates, unavailable } = await rowsByFingerprint(supabase, identity.key, offerId);
  if (unavailable) {
    return {
      assessment: classifyOfferMatch({ incoming, candidate: null }),
      incoming: incomingRow,
      candidate: null,
      retrieval: 'unavailable',
    };
  }
  let best: DuplicateAssessment | null = null;
  let bestRow: OfferRow | null = null;
  for (const candidateRow of candidates) {
    const assessment = classifyOfferMatch({ incoming, candidate: snapshot(candidateRow) });
    if (assessment.relation === 'NO_MATCH') continue;
    if (!best || (assessment.confidence ?? 0) > (best.confidence ?? 0)) {
      best = assessment;
      bestRow = candidateRow;
    }
  }
  return {
    assessment: best ?? classifyOfferMatch({ incoming, candidate: null }),
    incoming: incomingRow,
    candidate: bestRow,
    retrieval: 'ok',
  };
}
