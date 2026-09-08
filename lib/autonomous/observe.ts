import type { SupabaseClient } from '@supabase/supabase-js';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import { peekHunterHealthMemory } from '@/lib/hunter/healthStore';
import type { HunterHealthStatus, HunterSourceId } from '@/lib/hunter/types';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import { evaluateMonetizationReadiness } from '@/lib/moderation/monetizationReadiness';
import type { DealVerifierResult } from '@/lib/verifier/types';
import { decideAutonomous } from './decide';
import {
  lookupDuplicateForShadow,
  type ShadowDuplicateLookup,
} from './duplicateLookup';
import { recordAutonomousDecision } from './metrics';
import type { AutonomousDecisionInput, AutonomousDecisionResult } from './types';

function hunterSourceForIngest(source: string): HunterSourceId | null {
  if (source === 'ml_api') return 'ml_api_legacy';
  if (source === 'ml_worker') return 'ml_worker';
  if (source === 'amazon_asin') return 'amazon_asin';
  if (source === 'amazon_paapi') return 'amazon_paapi';
  if (source === 'env_urls') return 'env_urls';
  return null;
}

function sourceHealthFor(source: string): HunterHealthStatus | null {
  const id = hunterSourceForIngest(source);
  if (!id) return null;
  return peekHunterHealthMemory(id)?.status ?? null;
}

export function buildAutonomousInput(opts: {
  verifier: DealVerifierResult;
  meta: ParsedOfferMetadata;
  source: string;
  config: Pick<BotIngestConfig, 'autoApproveMinScore' | 'autoApproveRequireImage' | 'autoApproveEnabled'>;
  sourceHealth?: HunterHealthStatus | null;
  existingModerationStatus?: string | null;
  linkModOk?: boolean | null;
  shadowDuplicate?: ShadowDuplicateLookup;
}): AutonomousDecisionInput {
  const url = opts.meta.canonicalUrl;
  return {
    verifier: opts.verifier,
    thresholds: {
      autoApproveMinScore: opts.config.autoApproveMinScore,
      requireImage: opts.config.autoApproveRequireImage,
      autoApproveEnabled: opts.config.autoApproveEnabled,
    },
    monetization: evaluateMonetizationReadiness({
      offerUrl: url,
      originalOfferUrl: url,
      linkModOk: opts.linkModOk,
    }),
    requiresAffiliateValidation: offerRequiresAffiliateValidation(url),
    source: opts.source,
    sourceHealth: opts.sourceHealth === undefined ? sourceHealthFor(opts.source) : opts.sourceHealth,
    existingModerationStatus: opts.existingModerationStatus ?? null,
    title: opts.meta.title,
    imageUrl: opts.meta.imageUrl,
    store: opts.meta.store,
    price: opts.meta.discountPrice,
    discountPercent: opts.meta.discountPercent,
    effectiveDiscountPercent: opts.meta.signals?.effectiveDiscountPercent ?? null,
    suspectedArtificialListPrice: Boolean(opts.meta.signals?.suspectedArtificialListPrice),
    shadowDuplicate: opts.shadowDuplicate,
  };
}

/**
 * Observación shadow. Nunca publica ni rechaza.
 * Swallow de errores: el ingest productivo no debe fallar por el motor.
 */
export function observeAutonomousDecision(
  input: AutonomousDecisionInput,
  extras?: { sourceDetail?: string | null }
): AutonomousDecisionResult | null {
  try {
    const result = decideAutonomous(input);
    recordAutonomousDecision(result, input.source, {
      sourceDetail: extras?.sourceDetail,
      imageUrl: input.imageUrl,
      verifierDecision: input.verifier.decision,
    });
    return result;
  } catch {
    return null;
  }
}

export async function observeIngestShadow(opts: {
  verifier: DealVerifierResult;
  meta: ParsedOfferMetadata;
  source: IngestSourceId | string;
  sourceDetail?: string | null;
  config: Pick<BotIngestConfig, 'autoApproveMinScore' | 'autoApproveRequireImage' | 'autoApproveEnabled'>;
  supabase?: SupabaseClient | null;
  duplicateCache?: Map<string, ShadowDuplicateLookup>;
  shadowDuplicate?: ShadowDuplicateLookup;
  sourceHealth?: HunterHealthStatus | null;
}): Promise<AutonomousDecisionResult | null> {
  try {
    const shadowDuplicate =
      opts.shadowDuplicate ??
      (await lookupDuplicateForShadow(opts.supabase ?? null, opts.meta.canonicalUrl, {
        cache: opts.duplicateCache,
      }));
    return observeAutonomousDecision(
      buildAutonomousInput({
        verifier: opts.verifier,
        meta: opts.meta,
        source: opts.source,
        config: opts.config,
        shadowDuplicate,
        sourceHealth: opts.sourceHealth,
      }),
      { sourceDetail: opts.sourceDetail }
    );
  } catch {
    return observeAutonomousDecision(
      buildAutonomousInput({
        verifier: opts.verifier,
        meta: opts.meta,
        source: opts.source,
        config: opts.config,
        shadowDuplicate: {
          status: 'unknown',
          detail: 'duplicate_check_error',
          matchId: null,
        },
      }),
      { sourceDetail: opts.sourceDetail }
    );
  }
}
