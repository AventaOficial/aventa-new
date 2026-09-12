/**
 * Convergencia community → pipeline de calidad canónico.
 * No publica. No salta verifier. Reputación no decide status.
 * Sin fetch de retailers (no scrape en POST).
 */
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { IngestItem, IngestSourceId } from '@/lib/bots/ingest/types';
import { observeAutonomousDecision, buildAutonomousInput } from '@/lib/autonomous/observe';
import type { AutonomousDecision, AutonomousDecisionResult } from '@/lib/autonomous/types';
import { qualifyParsedOfferMetadata } from '@/lib/hunter/dealQualification/applyToCandidates';
import { scanProductBoundPromotionText } from '@/lib/hunter/dealQualification/signals';
import type { DealQualification, DealQualificationResult, PriceProvenance } from '@/lib/hunter/dealQualification/types';
import { classifyOfferMonetization } from '@/lib/hunter/dayToDay/monetization';
import type { HunterSourceId } from '@/lib/hunter/types';
import { evaluateDealSafe } from '@/lib/verifier/evaluateDeal';
import type { DealVerifierDecision } from '@/lib/verifier/types';
import { resolveCommunityUrl } from './resolve';
import { recordCommunityQuality } from './communityQualityMetrics';
import type { OfferAutoApproveDecision } from '@/lib/server/offerAutoApprove';

export type CommunitySubmissionInput = {
  title: string;
  store: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  offerUrl: string | null;
  description?: string | null;
  coupons?: string | null;
};

export type CommunityQualityEvaluation = {
  ingestItem: IngestItem;
  resolvedSource: IngestSourceId;
  hunterSourceId: HunterSourceId;
  canonicalUrl: string | null;
  qualification: DealQualification | null;
  qualificationReasons: string[];
  currentPriceProvenance: PriceProvenance;
  originalPriceProvenance: PriceProvenance;
  monetizationStatus: ReturnType<typeof classifyOfferMonetization>;
  verifierDecision: DealVerifierDecision | null;
  verifierScore: number | null;
  autonomousDecision: AutonomousDecision | null;
  autonomousResult: AutonomousDecisionResult | null;
  reputationWouldApprove: boolean;
  persistStatus: 'pending';
  published: false;
  rewardsTouched: false;
  verifierBypassed: false;
  qualityError: string | null;
};

function userMeta(input: CommunitySubmissionInput, canonicalUrl: string): ParsedOfferMetadata {
  const original = input.originalPrice != null && input.originalPrice > input.price ? input.originalPrice : null;
  const discountPercent =
    original != null && input.price > 0 ? Math.round((1 - input.price / original) * 100) : 0;
  const promo = scanProductBoundPromotionText(
    [input.title, input.description, input.coupons].filter(Boolean).join(' · '),
  );
  return {
    canonicalUrl,
    title: input.title,
    store: input.store,
    imageUrl: input.imageUrl ?? '',
    discountPrice: input.price,
    originalPrice: original,
    discountPercent,
    signals: {
      currentPriceProvenance: input.price > 0 ? 'user_declared' : 'unknown',
      originalPriceProvenance: original != null ? 'user_declared' : 'unknown',
      discountPercentProvenance: original != null ? 'user_declared' : 'unknown',
      explicitDiscountPercent: null,
      promotionType: promo.kind,
      promotionBoundToProduct: promo.kind != null,
    },
  };
}

/**
 * Evalúa una submission community con el mismo contrato que machine.
 * persistStatus es siempre pending. Reputación solo se registra.
 */
export function evaluateCommunitySubmission(
  input: CommunitySubmissionInput,
  opts: {
    reputation?: OfferAutoApproveDecision | null;
    sourceMeta?: ParsedOfferMetadata | null;
  } = {},
): CommunityQualityEvaluation {
  let hunterSourceId: HunterSourceId = 'env_urls';
  let ingestSource: IngestSourceId = 'env_urls';
  let canonicalUrl = input.offerUrl?.trim() || null;
  try {
    const resolved = input.offerUrl ? resolveCommunityUrl(input.offerUrl) : null;
    if (resolved?.ok) {
      hunterSourceId = resolved.hunterSourceId;
      ingestSource = resolved.ingestSourceId;
      canonicalUrl = resolved.url;
    }
  } catch {
    // URL ilegible → generic. No tumba el POST.
  }

  const base: Omit<
    CommunityQualityEvaluation,
    'ingestItem' | 'qualification' | 'qualificationReasons' | 'currentPriceProvenance' | 'originalPriceProvenance'
  > = {
    resolvedSource: ingestSource,
    hunterSourceId,
    canonicalUrl,
    monetizationStatus: classifyOfferMonetization(canonicalUrl),
    verifierDecision: null,
    verifierScore: null,
    autonomousDecision: null,
    autonomousResult: null,
    reputationWouldApprove: opts.reputation?.approved === true,
    persistStatus: 'pending',
    published: false,
    rewardsTouched: false,
    verifierBypassed: false,
    qualityError: null,
  };

  const fallbackItem: IngestItem = {
    url: canonicalUrl ?? '',
    source: ingestSource,
    sourceDetail: 'community:paste',
  };

  try {
    const declared = userMeta(input, canonicalUrl ?? '');
    const sourceMeta = opts.sourceMeta ?? null;
    const meta: ParsedOfferMetadata = sourceMeta
      ? {
          ...declared,
          ...sourceMeta,
          title: sourceMeta.title || declared.title,
          store: sourceMeta.store || declared.store,
          signals: {
            ...declared.signals,
            ...sourceMeta.signals,
          },
        }
      : declared;

    const item: IngestItem = {
      url: meta.canonicalUrl || canonicalUrl || '',
      source: ingestSource,
      sourceDetail: 'community:paste',
      precomputedMeta: meta,
    };

    const q: DealQualificationResult = qualifyParsedOfferMetadata(meta);
    item.qualification = q;

    const config = loadBotIngestConfig();
    const verifier = evaluateDealSafe({
      meta,
      config,
      source: ingestSource,
      url: meta.canonicalUrl,
      duplicateChecked: true,
    });
    let auto: ReturnType<typeof observeAutonomousDecision> = null;
    try {
      auto = observeAutonomousDecision(
        buildAutonomousInput({
          verifier,
          meta,
          source: ingestSource,
          config,
          sourceHealth: null,
        }),
        { sourceDetail: 'community:paste' },
      );
    } catch {
      auto = null;
    }

    recordCommunityQuality({
      qualification: q.qualification,
      verifierDecision: verifier.decision,
      verifierScore: verifier.score,
      rejectionReasons: verifier.decision === 'reject' ? verifier.reasons.slice(0, 3) : [],
    });

    return {
      ...base,
      ingestItem: item,
      qualification: q.qualification,
      qualificationReasons: q.reasons,
      currentPriceProvenance: q.currentPriceProvenance,
      originalPriceProvenance: q.originalPriceProvenance,
      verifierDecision: verifier.decision,
      verifierScore: verifier.score,
      autonomousDecision: auto?.decision ?? null,
      autonomousResult: auto,
    };
  } catch (error) {
    recordCommunityQuality({ qualification: null, verifierDecision: null, error: true });
    return {
      ...base,
      ingestItem: fallbackItem,
      qualification: null,
      qualificationReasons: [],
      currentPriceProvenance: 'user_declared',
      originalPriceProvenance: input.originalPrice != null ? 'user_declared' : 'unknown',
      qualityError: error instanceof Error ? error.message : 'quality_pipeline_failed',
    };
  }
}

/** Status productivo de community: siempre pending. Quality gate > reputation. */
export function communityPersistStatus(evaluation: CommunityQualityEvaluation): 'pending' {
  void evaluation;
  return 'pending';
}
