/**
 * Price provenance preservation — S8.
 *
 * Never invents reference prices. Seller-declared original_price is untrusted
 * unless backed by explicit provenance (listing_card, source_explicit, api_quote).
 */

import {
  isTrustedMachineOriginalProvenance,
  normalizeMachineCardDiscountSource,
  preserveMachinePriceProvenance,
} from '@/lib/bots/ingest/machinePriceProvenance';
import { isBadgeOnlyCardEvidence } from '@/lib/bots/ingest/mlWorkerPendingGate';
import type { OfferQualitySignals } from '@/lib/bots/ingest/offerQualitySignals';
import type { OpportunityCandidate, PriceProvenance, PriceProvenanceKind } from './types';

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function finitePositive(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function mapProvenanceKind(
  raw: string | null | undefined,
  trusted: boolean,
): PriceProvenanceKind {
  const p = (raw ?? '').trim().toLowerCase();
  if (!p || p === 'unknown') return trusted ? 'listing_card' : 'unknown';
  if (p === 'listing_card' || p === 'source_explicit') {
    return p as PriceProvenanceKind;
  }
  if (p === 'price_intel_derivation') return 'price_intel_derivation';
  if (p === 'trusted_enrichment') return 'source_explicit';
  return trusted ? 'source_explicit' : 'candidate_declared';
}

export type BuildPriceEvidenceInput = {
  candidate: OpportunityCandidate;
  now?: Date;
  /** Optional adapter-provided sale/list quotes (already provenance-tagged). */
  adapterSale?: PriceProvenance | null;
  adapterList?: PriceProvenance | null;
};

export type BuiltPriceEvidence = {
  signals: OfferQualitySignals;
  salePrice: PriceProvenance;
  referencePrice: PriceProvenance | null;
  discountPercent: number | null;
  suspectedArtificialListPrice: boolean;
};

/**
 * Merge candidate + machine provenance rules into sale/reference prices.
 * Reference is null when no trusted evidence exists — never backfilled from badge %.
 */
export function buildPriceEvidence(input: BuildPriceEvidenceInput): BuiltPriceEvidence {
  const { candidate, now } = input;
  const observedAt = nowIso(now);

  const saleAmount =
    finitePositive(input.adapterSale?.amount) ?? finitePositive(candidate.salePrice);

  const preserved = preserveMachinePriceProvenance({
    salePrice: saleAmount ?? 0,
    originalPrice: candidate.declaredOriginalPrice ?? null,
    signals: candidate.signals ?? undefined,
    cardDiscountSource: candidate.cardDiscountSource,
    cardBadgePercent: candidate.cardBadgePercent,
  });

  const signals = preserved.signals;
  const cardSource = normalizeMachineCardDiscountSource(
    signals.cardDiscountSource ?? candidate.cardDiscountSource,
  );
  const originalProv = signals.originalPriceProvenance ?? null;
  const badgeOnly = isBadgeOnlyCardEvidence(cardSource);

  const salePrice: PriceProvenance = input.adapterSale ?? {
    amount: saleAmount,
    kind: 'candidate_declared',
    source: candidate.sourceId ?? 'candidate',
    observedAt,
    trusted: saleAmount != null,
  };

  let referencePrice: PriceProvenance | null = null;

  if (input.adapterList?.amount != null && input.adapterList.trusted) {
    referencePrice = input.adapterList;
  } else if (badgeOnly) {
    referencePrice = {
      amount: null,
      kind: 'unavailable',
      source: candidate.sourceId ?? 'candidate',
      observedAt,
      trusted: false,
    };
  } else {
    const declaredOriginal = finitePositive(candidate.declaredOriginalPrice);
    const trustedOriginal =
      !badgeOnly && isTrustedMachineOriginalProvenance(originalProv);
    const validOriginal =
      declaredOriginal != null &&
      saleAmount != null &&
      declaredOriginal > saleAmount;

    if (validOriginal && trustedOriginal) {
      referencePrice = {
        amount: declaredOriginal,
        kind: mapProvenanceKind(originalProv, true),
        source: candidate.sourceId ?? 'candidate',
        observedAt,
        trusted: true,
      };
    } else if (validOriginal && !trustedOriginal) {
      referencePrice = {
        amount: null,
        kind: 'unavailable',
        source: candidate.sourceId ?? 'candidate',
        observedAt,
        trusted: false,
      };
    } else {
      referencePrice = null;
    }
  }

  let discountPercent: number | null = null;
  if (
    referencePrice?.trusted &&
    referencePrice.amount != null &&
    saleAmount != null &&
    referencePrice.amount > saleAmount
  ) {
    discountPercent = Math.round((1 - saleAmount / referencePrice.amount) * 100);
  }

  const suspectedArtificialListPrice =
    signals.suspectedArtificialListPrice === true ||
    (badgeOnly && candidate.declaredDiscountPercent != null);

  return {
    signals,
    salePrice,
    referencePrice,
    discountPercent,
    suspectedArtificialListPrice,
  };
}

/** Wrap an adapter/API quote as trusted list price when amount > sale. */
export function provenanceFromApiQuote(input: {
  adapterId: string;
  saleAmount: number;
  listAmount: number | null;
  observedAt?: string;
}): { sale: PriceProvenance; list: PriceProvenance | null } {
  const observedAt = input.observedAt ?? nowIso();
  const sale = finitePositive(input.saleAmount);
  const list = finitePositive(input.listAmount);
  const saleProv: PriceProvenance = {
    amount: sale,
    kind: 'api_quote',
    source: input.adapterId,
    observedAt,
    trusted: sale != null,
  };
  if (list == null || sale == null || list <= sale) {
    return { sale: saleProv, list: null };
  }
  return {
    sale: saleProv,
    list: {
      amount: list,
      kind: 'api_quote',
      source: input.adapterId,
      observedAt,
      trusted: true,
    },
  };
}
