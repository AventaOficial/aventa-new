/**
 * Supply Intelligence — main evaluation entry (S8).
 *
 * Candidate → OpportunityEvaluation. Read-only; no offers.pending writes.
 */

import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { isOfferAmazonHost, isOfferMercadoLibreHost } from '@/lib/offers/commerceHostAllowlist';
import { createAmazonPriceAdapter } from './adapters/amazon';
import { createGenericPriceAdapter } from './adapters/generic';
import { createMercadoLibrePriceAdapter } from './adapters/mercadolibre';
import type { PriceSourceAdapter } from './adapters/types';
import {
  DEFAULT_MIN_DISCOUNT_PERCENT,
  deriveOpportunityDecision,
  scoreOpportunity,
} from './opportunityScore';
import { buildPriceEvidence } from './priceProvenance';
import type {
  OpportunityCandidate,
  OpportunityEvaluation,
  OpportunityEvidence,
  OpportunityEvidenceLevel,
} from './types';

export type EvaluateOpportunityOptions = {
  now?: Date;
  minDiscountPercent?: number;
  /** Skip live adapter fetch — use candidate evidence only. */
  skipAdapterFetch?: boolean;
  adapter?: PriceSourceAdapter | null;
  forceDryRun?: boolean;
  ingestConfig?: Pick<BotIngestConfig, 'titleBlocklistGenericRe' | 'titleBlocklistSpamRe'>;
};

function resolveAdapter(candidate: OpportunityCandidate): PriceSourceAdapter {
  try {
    const host = new URL(candidate.canonicalUrl ?? candidate.url).hostname;
    if (isOfferMercadoLibreHost(host)) return createMercadoLibrePriceAdapter();
    if (isOfferAmazonHost(host)) return createAmazonPriceAdapter();
  } catch {
    /* fall through */
  }
  return createGenericPriceAdapter(candidate.store ?? undefined);
}

function deriveEvidenceLevel(
  priceEvidence: ReturnType<typeof buildPriceEvidence>,
  adapterId: string | null,
  adapterDryRun: boolean,
): OpportunityEvidenceLevel {
  if (priceEvidence.signals.historyReady === true && priceEvidence.referencePrice?.trusted) {
    return 'history_backed';
  }
  if (
    priceEvidence.referencePrice?.kind === 'api_quote' &&
    priceEvidence.referencePrice.trusted &&
    !adapterDryRun
  ) {
    return 'api_verified';
  }
  const card = (priceEvidence.signals.cardDiscountSource ?? '').trim().toLowerCase();
  const orig = (priceEvidence.signals.originalPriceProvenance ?? '').trim().toLowerCase();
  if (card === 'badge_reconstructed') return 'weak_card';
  if (orig === 'listing_card' || card === 'card_strikethrough') return 'strong_card';
  if (priceEvidence.referencePrice?.trusted) return 'strong_card';
  if (adapterId && adapterDryRun) return 'weak_card';
  return 'none';
}

/**
 * Evaluate a supply candidate for genuine opportunity evidence.
 * Fail-closed: no trusted reference → no OPPORTUNITY decision.
 */
export async function evaluateOpportunity(
  candidate: OpportunityCandidate,
  options: EvaluateOpportunityOptions = {},
): Promise<OpportunityEvaluation> {
  const now = options.now ?? new Date();
  const evaluatedAt = now.toISOString();
  const adapterNotes: string[] = [];
  const adapter = options.adapter ?? resolveAdapter(candidate);
  let adapterDryRun = options.forceDryRun === true || !adapter.isLiveEnabled();

  let adapterSale = null;
  let adapterList = null;

  if (!options.skipAdapterFetch) {
    const fetchResult = await adapter.fetchCurrentPrice({
      url: candidate.url,
      canonicalUrl: candidate.canonicalUrl,
      fallbackSalePrice: candidate.salePrice,
      fallbackListPrice: candidate.declaredOriginalPrice ?? null,
    });
    adapterDryRun = adapterDryRun || fetchResult.dryRun;
    if (fetchResult.salePrice) adapterSale = fetchResult.salePrice;
    if (fetchResult.listPrice) adapterList = fetchResult.listPrice;
    if (fetchResult.errorCode) {
      adapterNotes.push(`${adapter.id}:${fetchResult.errorCode}`);
      if (fetchResult.dryRun) adapterNotes.push('ADAPTER_DRY_RUN');
    }
  } else {
    adapterNotes.push('adapter_fetch_skipped');
    adapterDryRun = true;
  }

  const priceBuilt = buildPriceEvidence({
    candidate,
    now,
    adapterSale,
    adapterList,
  });

  const canonical = (candidate.canonicalUrl ?? candidate.url).trim();
  const fingerprint = strongProductFingerprintForUrl(canonical);
  const hasImage = Boolean((candidate.imageUrl ?? '').trim());

  const evidence: OpportunityEvidence = {
    salePrice: priceBuilt.salePrice,
    referencePrice: priceBuilt.referencePrice,
    discountPercent: priceBuilt.discountPercent,
    evidenceLevel: deriveEvidenceLevel(priceBuilt, adapter.id, adapterDryRun),
    historyReady: priceBuilt.signals.historyReady === true,
    suspectedArtificialListPrice: priceBuilt.suspectedArtificialListPrice,
    hasImage,
    productFingerprint: fingerprint,
    signals: priceBuilt.signals,
  };

  const minDiscount = options.minDiscountPercent ?? DEFAULT_MIN_DISCOUNT_PERCENT;
  const score = scoreOpportunity({
    evidence,
    title: candidate.title,
    minDiscountPercent: minDiscount,
    pdpBlocked: candidate.pdpBlocked,
    ingestConfig: options.ingestConfig,
  });

  if (adapterDryRun && !score.reasonCodes.includes('ADAPTER_DRY_RUN')) {
    score.reasonCodes.push('ADAPTER_DRY_RUN');
  }
  if (!adapter.isLiveEnabled() && !score.reasonCodes.includes('ADAPTER_UNAVAILABLE')) {
    score.reasonCodes.push('ADAPTER_UNAVAILABLE');
  }

  const decision = deriveOpportunityDecision(score, evidence, minDiscount);

  return {
    candidateUrl: candidate.url,
    productFingerprint: fingerprint,
    decision,
    score,
    evidence,
    evaluatedAt,
    dryRun: adapterDryRun || options.forceDryRun === true,
    adapterNotes,
  };
}
