import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyDespensaText } from '@/lib/despensa/classify';
import { despensaHostOf, despensaSourceForUrl } from '@/lib/despensa/sources';
import type { DespensaOffer } from '@/lib/despensa/plan';
import type { FeedOffer } from '@/lib/offers/feedService';
import type { DespensaPriceHistory } from '@/lib/despensa/evidence';
import type { PriceInsight } from '@/lib/offers/priceHistory';
import { evaluatePriceHistory, type PriceHistoryEvaluation } from '@/lib/offers/priceObservations/evaluate';
import { anchorKey, captureSourceIdOf, productAnchorFor, readProduct, type ProductAnchor } from '@/lib/offers/priceObservations/identity';
import { readProductObservations } from '@/lib/offers/priceObservations/read';
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
      current: e.current,
      priceRelation: e.priceRelation,
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
 * Ofertas de Despensa con el historial propio de su producto. Solo lectura: no escribe precios
 * ni ofertas. El historial se lee por item externo (tienda:item), así que una oferta nueva del
 * mismo producto hereda la serie y una caducada no la borra. Solo cuentan observaciones de la
 * misma necesidad, variante y presentación que declara la oferta.
 * La moneda y la huella se leen de `offers` (la vista del feed no las trae); si esa lectura
 * falla, queda solo la moneda que confirma el dominio y el item que trae la URL.
 */
export async function loadDespensaOffers(supabase: SupabaseClient, feed: readonly FeedOffer[]): Promise<{
  offers: DespensaOffer[];
  excludedCurrency: number;
}> {
  const classified = feed.filter((o) => o.price > 0 && classifyDespensaText(o.title) != null);
  if (classified.length === 0) return { offers: [], excludedCurrency: 0 };

  const stored = new Map<string, { currency: string | null; fingerprint: string | null }>();
  const { data, error } = await supabase
    .from('offers')
    .select('id, source_currency, product_fingerprint')
    .in(
      'id',
      classified.map((o) => o.id),
    );
  if (!error && data) {
    for (const row of data as { id: string; source_currency: string | null; product_fingerprint?: string | null }[]) {
      stored.set(row.id, { currency: row.source_currency, fingerprint: row.product_fingerprint ?? null });
    }
  }

  const eligible = classified.filter((o) =>
    isDespensaCandidate(o, resolveOfferSourceCurrency(stored.get(o.id)?.currency ?? null, o.offer_url)),
  );
  const now = new Date();
  const anchors = new Map<string, ProductAnchor>();
  for (const o of eligible) {
    const anchor = productAnchorFor(captureSourceIdOf(despensaSourceForUrl(o.offer_url)?.id), {
      offerUrl: o.offer_url,
      productFingerprint: stored.get(o.id)?.fingerprint ?? null,
    });
    if (anchor) anchors.set(o.id, anchor);
  }
  const history = await readProductObservations(supabase, [...anchors.values()], { now });
  return {
    offers: eligible.map((o) => {
      const anchor = anchors.get(o.id);
      const h = anchor ? history.byAnchor.get(anchorKey(anchor)) : undefined;
      const evaluation = evaluatePriceHistory({
        rows: h?.rows ?? [],
        // Sin item externo no hay serie que leer: no es un historial incompleto, es ninguno.
        historyComplete: anchor ? (h?.complete ?? false) : true,
        currentPrice: o.price,
        originalPrice: o.original_price,
        now,
        expect: readProduct(o.title),
      });
      return toDespensaOffer(o, engineHistory(evaluation));
    }),
    excludedCurrency: classified.length - eligible.length,
  };
}
