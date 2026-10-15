import { identityFromOffer } from '@/lib/offers/duplicateIntelligence/identity';
import type { PublicSearchHit } from '@/lib/offers/searchPublicOffers';

export type SearchPriceAlternate = {
  offer_id: string;
  price: number;
  discount_pct: number;
};

export function searchHitDiscountPct(hit: Pick<PublicSearchHit, 'price' | 'original_price'>): number {
  const original = hit.original_price;
  const price = hit.price;
  if (original == null || original <= 0 || price <= 0) return 0;
  return Math.round((1 - price / original) * 100);
}

export function searchHitVoteScore(hit: PublicSearchHit): number {
  if (hit.ranking_momentum != null && Number.isFinite(hit.ranking_momentum)) return hit.ranking_momentum;
  if (Number.isFinite(hit.score)) return hit.score;
  return 0;
}

function productGroupKey(hit: PublicSearchHit): string | null {
  const identity = identityFromOffer({ offerUrl: hit.offer_url, title: hit.title });
  if (!identity.key || identity.strength !== 'strong') return null;
  return `${identity.key}|${identity.variant ?? ''}`;
}

/**
 * Misma identidad de producto → una tarjeta (la de más votos). Si otra publicación tiene mejor
 * descuento, se expone como alternativa sin duplicar la fila en el listado.
 * El orden global sigue el de relevancia de la búsqueda (primera aparición del grupo).
 */
export function organizeSearchHits(hits: readonly PublicSearchHit[]): {
  hits: PublicSearchHit[];
  priceAlternateByLeaderId: Map<string, SearchPriceAlternate>;
} {
  if (hits.length === 0) return { hits: [], priceAlternateByLeaderId: new Map() };

  const groups = new Map<string, PublicSearchHit[]>();
  for (const hit of hits) {
    const key = productGroupKey(hit);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(hit);
    groups.set(key, list);
  }

  const priceAlternateByLeaderId = new Map<string, SearchPriceAlternate>();

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const byVotes = [...members].sort((a, b) => searchHitVoteScore(b) - searchHitVoteScore(a));
    const leader = byVotes[0];

    const byPrice = [...members].sort((a, b) => {
      const dd = searchHitDiscountPct(b) - searchHitDiscountPct(a);
      if (dd !== 0) return dd;
      return a.price - b.price;
    });
    const priceLeader = byPrice[0];
    if (priceLeader.id !== leader.id) {
      priceAlternateByLeaderId.set(leader.id, {
        offer_id: priceLeader.id,
        price: priceLeader.price,
        discount_pct: searchHitDiscountPct(priceLeader),
      });
    }
  }

  const seenGroup = new Set<string>();
  const ordered: PublicSearchHit[] = [];

  for (const hit of hits) {
    const key = productGroupKey(hit);
    if (!key) {
      ordered.push(hit);
      continue;
    }
    if (seenGroup.has(key)) continue;
    seenGroup.add(key);
    const members = groups.get(key)!;
    if (members.length === 1) {
      ordered.push(members[0]);
      continue;
    }
    const leader = [...members].sort((a, b) => searchHitVoteScore(b) - searchHitVoteScore(a))[0];
    ordered.push(leader);
  }

  return { hits: ordered, priceAlternateByLeaderId };
}

export function applySearchPriceAlternates(
  hits: PublicSearchHit[],
  priceAlternateByLeaderId: Map<string, SearchPriceAlternate>,
): PublicSearchHit[] {
  return hits.map((hit) => {
    const alt = priceAlternateByLeaderId.get(hit.id);
    if (!alt) return hit;
    return { ...hit, search_price_alternate: alt };
  });
}
