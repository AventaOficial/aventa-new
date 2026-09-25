/**
 * Machine pending writer facade.
 * Authorization + S6.1 live eligibility + negative-memory gates stay here.
 * Persistence goes solely through ingestOfferObservation (no direct offers.insert).
 *
 * Callers cannot mint by forging gateAction/wouldInsert — S6.1 is re-evaluated here.
 */

import { createServerClient } from '@/lib/supabase/server';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate';
import { normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { BotIngestConfig } from './config';
import type { ScoreBreakdown, ScoreDecision } from './scoreIngestCandidate';
import { resolveBotAuthorUserId } from './resolveBotAuthorUserId';
import { classifyBotCategoryForStorage } from './classifyBotCategory';
import { buildBotOfferDescription } from './buildBotOfferDescription';
import type { DealScore } from '@/lib/dealIntelligence';
import type { RawObservationProvenanceSlice } from '@/lib/dealIntelligence/rawObservation';
import { buildBotMeta } from './buildBotMeta';
import {
  evaluateDealQualityFromParsedMeta,
  recordDealQualityDecision,
  toDealQualityTelemetry,
} from '@/lib/hunter/dealQuality';
import { buildHunterDecisionTrace } from './hunterDecisionTrace';
import type { CandidateGateResult } from './candidateInsertGate';
import { resolveBotInsertPublication } from './resolveBotInsertPublication';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import { isSupplyOpportunity } from '@/lib/offers/supplyOpportunity';
import {
  assertMachineOfferWriteAuthorized,
  resolveMachineInsertStatus,
} from './machineWriteAuth';
import { formatOfferScopeCondition, inferBotOfferScope } from '@/lib/offerScope';
import { isSuppressedByNegativeMemory } from '@/lib/discovery/negativeMemory';
import { evaluateMachineLiveInsertEligibility } from './machineLiveInsertEligibility';
import type { HunterDecisionTrace } from './hunterDecisionTrace';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { classifyDuplicateOfferRow } from '@/lib/offers/findDuplicateOffer';

export type InsertIngestOptions = {
  status: 'pending' | 'approved';
  titleOverride?: string;
  ingestScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  moderatorNote?: string;
  ingestSource?: string;
  ingestSourceDetail?: string;
  decision?: ScoreDecision;
  dealScore?: DealScore | null;
  rawObservation?: RawObservationProvenanceSlice | null;
  /** Caller-provided gate labels are audit-only; S6.1 is re-evaluated below. */
  gateAction?: string | null;
  gateReason?: string | null;
  gateReasonCodes?: string[] | null;
  gate?: CandidateGateResult | null;
};

export type InsertIngestResult =
  | { ok: true; offerId: string }
  | {
      ok: false;
      duplicate: true;
      duplicateKind: DuplicateOfferKind;
      supplyOpportunity?: boolean;
    }
  | {
      ok: false;
      error: string;
      code?: 'NEGATIVE_MEMORY' | 'S61_BLOCKED';
      gate?: CandidateGateResult;
      hunterDecisionTrace?: HunterDecisionTrace;
    };

function buildModeratorComment(opts: InsertIngestOptions | undefined): string {
  if (opts?.ingestScore == null) {
    return `[bot-ingest] Creado por cron de ingesta; revisar precio y enlace.${opts?.moderatorNote ? ` ${opts.moderatorNote}` : ''}`;
  }
  const mode = opts.status === 'approved' ? 'auto-aprobada' : 'moderación';
  const b = opts.scoreBreakdown;
  const parts = b
    ? `d${b.discount} p${b.popularity} r${b.rating} c${b.category} $${b.priceAppeal}`
    : '';
  return `[bot-ingest v3] score=${opts.ingestScore} (${mode})${parts ? ` | ${parts}` : ''}${opts.moderatorNote ? ` | ${opts.moderatorNote}` : ''}`;
}

export async function insertIngestedOffer(
  meta: ParsedOfferMetadata,
  config: BotIngestConfig,
  opts?: InsertIngestOptions,
): Promise<InsertIngestResult> {
  const writeAuth = assertMachineOfferWriteAuthorized();
  if (!writeAuth.ok) {
    return { ok: false, error: writeAuth.error };
  }

  const authorId = resolveBotAuthorUserId(config, meta);
  if (!authorId) {
    return {
      ok: false,
      error:
        'Configura BOT_INGEST_USER_ID o el par BOT_INGEST_USER_ID_TECH + BOT_INGEST_USER_ID_STAPLES',
    };
  }

  const rawCanonical = (meta.canonicalUrl ?? '').trim();
  const originalOfferUrl = rawCanonical || null;
  const offerUrl = await resolveAndNormalizeAffiliateOfferUrl(
    rawCanonical || meta.canonicalUrl,
  );
  const supabase = createServerClient();

  const nm = await isSuppressedByNegativeMemory({ supabase, url: offerUrl });
  if (nm.suppressed) {
    return {
      ok: false,
      error: `negative_memory:${nm.reason ?? 'SUPPRESS'}`,
      code: 'NEGATIVE_MEMORY',
    };
  }

  // Pre-check is telemetry/classification only. Dedupe authority = UNIQUE ingestion_identity_key + ingestOfferObservation.
  const { findDuplicateOfferByUrl, strongProductFingerprintForUrl } = await import(
    '@/lib/offers/findDuplicateOffer'
  );
  const preDup = await findDuplicateOfferByUrl(supabase, offerUrl);
  const productFingerprint = strongProductFingerprintForUrl(offerUrl);

  // S6.1 write-boundary (defense-in-depth): re-evaluate DQE + canonical eligibility here.
  // Do not trust caller-provided gate / wouldInsert. Missing evidence or evaluator errors → REJECT.
  let botQuality: ReturnType<typeof evaluateDealQualityFromParsedMeta>;
  let live: ReturnType<typeof evaluateMachineLiveInsertEligibility>;
  let hunterDecisionTrace: HunterDecisionTrace;
  try {
    botQuality = evaluateDealQualityFromParsedMeta(meta, {
      source: opts?.ingestSource ?? null,
      productFingerprint: productFingerprint ?? null,
    });
    recordDealQualityDecision(botQuality);

    const verifierDecision =
      opts?.decision === 'reject' ||
      opts?.decision === 'auto_approve' ||
      opts?.decision === 'pending'
        ? opts.decision
        : 'pending';
    live = evaluateMachineLiveInsertEligibility({
      url: offerUrl || meta.canonicalUrl,
      meta,
      config,
      verifierDecision,
      verifierReasons: [],
      duplicate: null,
      dealScore: opts?.dealScore ?? null,
      dealQuality: botQuality,
    });
    hunterDecisionTrace = buildHunterDecisionTrace({
      meta,
      gate: live.gate,
      dealQuality: botQuality,
      dealScore: opts?.dealScore ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `s61_blocked:fail_closed_evaluator_error:${message.slice(0, 120)}`,
      code: 'S61_BLOCKED',
    };
  }

  if (!live.eligible || live.wouldInsert !== true) {
    return {
      ok: false,
      error: `s61_blocked:${live.gateReason}`,
      code: 'S61_BLOCKED',
      gate: live.gate,
      hunterDecisionTrace,
    };
  }

  const categoryFromEnv =
    config.category && config.category.trim()
      ? normalizeCategoryForStorage(config.category.trim())
      : null;
  const categoryInferred = classifyBotCategoryForStorage(meta, config.techCategoryIdSet);
  const categoryBase = categoryFromEnv ?? categoryInferred;
  const hasOriginal = meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  const requestedStatus = resolveMachineInsertStatus(opts?.status);
  const publication = resolveBotInsertPublication({
    requestedStatus,
    offerUrl,
  });
  const status = publication.status;
  const title = (opts?.titleOverride ?? meta.title).slice(0, 500);
  const description = buildBotOfferDescription(meta, categoryBase).slice(0, 2000);
  const imageNormalized = normalizeOfferImageUrl(meta.imageUrl) ?? '';
  const botScope = inferBotOfferScope({ store: meta.store, url: offerUrl });
  const conditions = botScope ? formatOfferScopeCondition(botScope) : null;

  const expiresAt =
    status === 'approved' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  const catNote = categoryBase ? ` cat=${categoryBase}` : '';
  const moderatorComment = buildModeratorComment({
    status,
    titleOverride: opts?.titleOverride,
    ingestScore: opts?.ingestScore,
    scoreBreakdown: opts?.scoreBreakdown,
    moderatorNote: `${opts?.moderatorNote ?? ''}${catNote}`.trim() || undefined,
  });

  const botMeta = buildBotMeta({
    meta,
    scoreBreakdown: opts?.scoreBreakdown,
    ingestSource: opts?.ingestSource,
    ingestSourceDetail: opts?.ingestSourceDetail,
    decision: opts?.decision,
    dealQuality: toDealQualityTelemetry(botQuality),
    dealScore: opts?.dealScore ?? null,
    rawObservation: opts?.rawObservation ?? null,
    gateAction: 'insert_pending',
    gateReason: live.gateReason || opts?.gateReason || null,
    hunterDecisionTrace: {
      reportedDiscountPercent: hunterDecisionTrace.reportedDiscountPercent,
      verifiedDiscountPercent: hunterDecisionTrace.verifiedDiscountPercent,
      historicalBaseline: hunterDecisionTrace.historicalBaseline,
      historicalBaselinePrice: hunterDecisionTrace.historicalBaselinePrice,
      currentPrice: hunterDecisionTrace.currentPrice,
      historicalObservationCount: hunterDecisionTrace.historicalObservationCount,
      effectiveDiscountPercent: hunterDecisionTrace.effectiveDiscountPercent,
      artificialListPrice: hunterDecisionTrace.artificialListPrice,
      originalPriceClass: hunterDecisionTrace.originalPriceClass,
      dqeDecision: hunterDecisionTrace.dqeDecision,
      dqeRecommendedAction: hunterDecisionTrace.dqeRecommendedAction,
      dealScore: hunterDecisionTrace.dealScore,
      s61Decision: hunterDecisionTrace.s61Decision,
      s61ReasonCodes: hunterDecisionTrace.s61ReasonCodes,
      finalLabel: hunterDecisionTrace.finalLabel,
      primaryReason: hunterDecisionTrace.primaryReason,
      whyPassedOrFailed: hunterDecisionTrace.whyPassedOrFailed,
    },
  });

  const result = await ingestOfferObservation(supabase, {
    createdBy: authorId,
    source: opts?.ingestSource ?? 'bot',
    onDuplicate: 'reuse',
    forceLoteTag: false,
    allowMissingUrl: false,
    recordSubmissionCount: false,
    recordPriceSnapshot: false,
    extractionMethod: opts?.ingestSourceDetail ?? 'bot_ingest',
    confidence: typeof opts?.ingestScore === 'number' ? Math.min(1, opts.ingestScore / 100) : null,
    seller: typeof meta.store === 'string' ? meta.store : null,
    offerExtras: {
      bot_meta: botMeta,
      moderator_comment: moderatorComment,
      link_mod_ok: publication.linkModOk ? true : null,
      conditions,
      expires_at: expiresAt ?? null,
    },
    body: {
      title,
      store: meta.store.slice(0, 200),
      hasDiscount: hasOriginal,
      price: meta.discountPrice,
      original_price: hasOriginal ? meta.originalPrice : null,
      image_url: imageNormalized.slice(0, 2048) || '/placeholder.png',
      offer_url: originalOfferUrl || offerUrl,
      description,
      category: categoryBase || undefined,
      conditions: conditions || undefined,
    },
  });

  if (!result.ok) {
    if (result.httpStatus === 409) {
      const kind =
        preDup?.kind ??
        classifyDuplicateOfferRow({ status: result.duplicate_status ?? 'pending' });
      return {
        ok: false,
        duplicate: true,
        duplicateKind: kind,
        supplyOpportunity: isSupplyOpportunity({
          candidatePrice: meta.discountPrice,
          existingPrice: preDup?.price ?? null,
        }),
      };
    }
    return { ok: false, error: result.error };
  }

  if (!result.created) {
    const kind =
      preDup?.kind ??
      classifyDuplicateOfferRow({
        status: result.status,
        created_at: new Date().toISOString(),
      });
    return {
      ok: false,
      duplicate: true,
      duplicateKind: kind,
      supplyOpportunity: isSupplyOpportunity({
        candidatePrice: meta.discountPrice,
        existingPrice: preDup?.price ?? null,
      }),
    };
  }

  return { ok: true, offerId: result.offerId };
}
