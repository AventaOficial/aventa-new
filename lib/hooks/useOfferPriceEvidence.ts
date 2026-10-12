'use client';

import { useEffect, useState } from 'react';
import type { PriceEvidence } from '@/lib/offers/listPriceComparison';
import type { PriceInsight } from '@/lib/offers/priceHistory';

/** Cualquier fallo (red, HTTP, cuerpo sin `insight`) queda como `unavailable`, nunca como verificado. */
export async function fetchOfferPriceEvidence(
  offerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PriceEvidence> {
  try {
    const res = await fetchImpl(`/api/offers/${encodeURIComponent(offerId)}/price-insight`);
    if (!res.ok) return { status: 'unavailable' };
    const data = (await res.json()) as { insight?: PriceInsight } | null;
    return data?.insight ? { status: 'ready', insight: data.insight } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Historial propio de la oferta; compartido por el encabezado de precio y el bloque de historial. */
export function useOfferPriceEvidence(offerId: string | null | undefined): PriceEvidence {
  const [result, setResult] = useState<{ offerId: string; evidence: PriceEvidence } | null>(null);

  useEffect(() => {
    if (!offerId) return;
    let cancelled = false;
    void fetchOfferPriceEvidence(offerId).then((evidence) => {
      if (!cancelled) setResult({ offerId, evidence });
    });
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  if (!offerId) return { status: 'unavailable' };
  return result?.offerId === offerId ? result.evidence : { status: 'loading' };
}
