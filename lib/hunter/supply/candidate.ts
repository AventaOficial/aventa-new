import { classifyOfferMonetization } from '@/lib/hunter/dayToDay/monetization';
import { qualifyCandidate } from '@/lib/hunter/dealQualification/qualifyCandidate';
import { qualificationInputFromParsedMeta } from '@/lib/hunter/dealQualification/applyToCandidates';
import type { DealQualificationResult } from '@/lib/hunter/dealQualification/types';
import { dedupeHunterCandidates, ingestItemToCandidate } from '@/lib/hunter/normalize';
import type { HunterCandidate, HunterSourceId } from '@/lib/hunter/types';
import type { IngestItem } from '@/lib/bots/ingest/types';
import type {
  CandidateTrustContext,
  SupplyCandidate,
  SupplyFamily,
  SupplySourceId,
  SupplySourceType,
} from './types';

export function emptyTrust(sourceType: SupplySourceType): CandidateTrustContext {
  return {
    sourceType,
    creatorId: null,
    creatorReputation: null,
    historicalApprovalRate: null,
    spamRate: null,
  };
}

function qualifyFromItem(item: IngestItem): DealQualificationResult | null {
  if (item.qualification) return item.qualification;
  if (!item.precomputedMeta) return null;
  return qualifyCandidate(qualificationInputFromParsedMeta(item.precomputedMeta));
}

export function toSupplyCandidate(opts: {
  item: IngestItem;
  hunterSourceId: HunterSourceId;
  sourceId: SupplySourceId;
  sourceFamily: SupplyFamily;
  sourceType: SupplySourceType;
  discoveredAt?: string;
  hunterCandidate?: HunterCandidate;
  trust?: CandidateTrustContext;
}): SupplyCandidate {
  const detectedAt = opts.discoveredAt ?? new Date().toISOString();
  const hunter =
    opts.hunterCandidate ?? ingestItemToCandidate(opts.item, opts.hunterSourceId, detectedAt);
  const q = qualifyFromItem(opts.item);
  const meta = opts.item.precomputedMeta;
  const url = hunter.url;
  const image = hunter.image;
  return {
    ingestItem: opts.item,
    hunterCandidate: hunter,
    sourceId: opts.sourceId,
    sourceFamily: opts.sourceFamily,
    sourceType: opts.sourceType,
    discoveredAt: detectedAt,
    sourceUrl: opts.item.url,
    canonicalUrl: url,
    title: hunter.title,
    price: hunter.price,
    originalPrice: hunter.originalPrice,
    currency: null,
    discountPercent: hunter.discount,
    promotionType: typeof meta?.signals?.promotionType === 'string' ? meta.signals.promotionType : null,
    images: image ? [image] : [],
    availability: null,
    seller: hunter.store,
    brand: null,
    sku: typeof meta?.signals?.listingTypeId === 'string' ? meta.signals.listingTypeId : null,
    productId: hunter.externalId,
    qualification: q?.qualification ?? null,
    qualificationReasons: q?.reasons ?? [],
    currentPriceProvenance: q?.currentPriceProvenance ?? 'unknown',
    originalPriceProvenance: q?.originalPriceProvenance ?? 'unknown',
    monetizationStatus: classifyOfferMonetization(url),
    trust: opts.trust ?? emptyTrust(opts.sourceType),
    duplicateOf: null,
    duplicateReason: null,
    duplicateSource: null,
    verifierDecision: null,
    autonomousDecision: null,
  };
}

export function fromHunterCandidate(
  candidate: HunterCandidate,
  routing: { sourceId: SupplySourceId; sourceFamily: SupplyFamily; sourceType: SupplySourceType },
): SupplyCandidate {
  return toSupplyCandidate({
    item: candidate.ingestItem,
    hunterSourceId: candidate.source,
    hunterCandidate: candidate,
    discoveredAt: candidate.detectedAt,
    ...routing,
  });
}

/**
 * Dedupe global reutilizando dedupeHunterCandidates.
 * Los perdedores se marcan; no se inventa un segundo algoritmo.
 */
export function dedupeSupplyCandidates(candidates: SupplyCandidate[]): {
  unique: SupplyCandidate[];
  duplicates: SupplyCandidate[];
} {
  const kept = new Set(
    dedupeHunterCandidates(candidates.map((c) => c.hunterCandidate)).map((c) => c),
  );
  const unique: SupplyCandidate[] = [];
  const duplicates: SupplyCandidate[] = [];
  const winnerByKey = new Map<string, SupplyCandidate>();

  for (const c of candidates) {
    const key = c.hunterCandidate.fingerprint || c.hunterCandidate.externalId || c.canonicalUrl;
    if (kept.has(c.hunterCandidate)) {
      unique.push(c);
      if (key) winnerByKey.set(key, c);
    }
  }
  for (const c of candidates) {
    if (kept.has(c.hunterCandidate)) continue;
    const key = c.hunterCandidate.fingerprint || c.hunterCandidate.externalId || c.canonicalUrl;
    const winner = key ? winnerByKey.get(key) : unique[0];
    duplicates.push({
      ...c,
      duplicateOf: winner?.canonicalUrl ?? unique[0]?.canonicalUrl ?? c.canonicalUrl,
      duplicateReason: c.hunterCandidate.fingerprint
        ? 'fingerprint'
        : c.hunterCandidate.externalId
          ? 'external_id'
          : 'canonical_url',
      duplicateSource: winner?.sourceId ?? null,
    });
  }
  return { unique, duplicates };
}
