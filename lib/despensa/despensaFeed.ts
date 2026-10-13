import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyDespensaText } from '@/lib/despensa/classify';
import { despensaHostOf } from '@/lib/despensa/sources';
import type { DespensaOffer } from '@/lib/despensa/plan';
import type { FeedOffer } from '@/lib/offers/feedService';
import type { DespensaPriceHistory } from '@/lib/despensa/evidence';
import type { PriceInsight } from '@/lib/offers/priceHistory';
import { evaluatePriceHistory, type PriceHistoryEvaluation } from '@/lib/offers/priceObservations/evaluate';
import { readOfferObservations } from '@/lib/offers/priceObservations/read';
import { resolveOfferSourceCurrency } from '@/lib/offers/sourceCurrency';
import { inferBotOfferScope, parseOfferScopeFromConditions } from '@/lib/offerScope';

/** Oferta del feed apta para Despensa: clasificada en el catálogo y con precio en MXN confirmado. */
export function isDespensaCandidate(offer: Pick<FeedOffer, 'title' | 'price'>, currency: string | null): boolean {
  return currency === 'MXN' && offer.price > 0 && classifyDespensaText(offer.title) != null;
}

/** Historial de Despensa a partir del veredicto del motor de precios. */
export function engineHistory(e: PriceHistoryEvaluation): DespensaPriceHistory {
  return {
    verdict: e.verdict,
    min90d: e.min,
    max90d: e.max,
    samples90d: e.samples,
    engine: {
      label: e.label,
      reference: e.reference,
      savingAmount: e.savingAmount,
      savingPct: e.savingPct,
      availabilityConfirmed: e.availabilityConfirmed,
      policyVersion: e.policyVersion,
    },
  };
}

export function toDespensaOffer(offer: FeedOffer, insight: PriceInsight | DespensaPriceHistory | null): DespensaOffer {
  return {
    id: offer.id,
    title: offer.title,
    discountPrice: offer.price,
    originalPrice: offer.original_price,
    store: offer.store,
    sourceHost: despensaHostOf(offer.offer_url),
    imageUrl: offer.images[0] ?? null,
    createdAt: offer.created_at || null,
    expiresAt: offer.expires_at,
    votes: { score: offer.up_votes - offer.down_votes },
    offerScope:
      parseOfferScopeFromConditions(offer.conditions) ??
      (inferBotOfferScope({ store: offer.store, url: offer.offer_url }) === 'online' ? 'online' : null),
    priceHistory: insight
      ? {
          verdict: insight.verdict,
          min90d: insight.min90d,
          max90d: insight.max90d,
          samples90d: insight.samples90d,
          ...('engine' in insight && insight.engine ? { engine: insight.engine } : {}),
        }
      : null,
  };
}

/**
 * Ofertas de Despensa con su historial propio. Solo lectura: no escribe precios ni ofertas.
 * La moneda se lee de `offers.source_currency` (la vista del feed no la trae); si esa lectura
 * falla, queda solo la que confirma el dominio.
 */
export async function loadDespensaOffers(supabase: SupabaseClient, feed: readonly FeedOffer[]): Promise<{
  offers: DespensaOffer[];
  excludedCurrency: number;
}> {
  const classified = feed.filter((o) => o.price > 0 && classifyDespensaText(o.title) != null);
  if (classified.length === 0) return { offers: [], excludedCurrency: 0 };

  const stored = new Map<string, string | null>();
  const { data, error } = await supabase
    .from('offers')
    .select('id, source_currency')
    .in(
      'id',
      classified.map((o) => o.id),
    );
  if (!error && data) {
    for (const row of data as { id: string; source_currency: string | null }[]) stored.set(row.id, row.source_currency);
  }

  const eligible = classified.filter((o) =>
    isDespensaCandidate(o, resolveOfferSourceCurrency(stored.get(o.id) ?? null, o.offer_url)),
  );
  const now = new Date();
  const history = await readOfferObservations(
    supabase,
    eligible.map((o) => o.id),
    { now },
  );
  return {
    offers: eligible.map((o) => {
      const h = history.byOffer.get(o.id);
      const evaluation = evaluatePriceHistory({
        rows: h?.rows ?? [],
        historyComplete: h?.complete ?? false,
        currentPrice: o.price,
        originalPrice: o.original_price,
        now,
      });
      return toDespensaOffer(o, engineHistory(evaluation));
    }),
    excludedCurrency: classified.length - eligible.length,
  };
}
