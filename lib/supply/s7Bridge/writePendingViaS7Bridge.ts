/**
 * S9 → S7 bridge: maps S8 evaluation + candidate → ParsedOfferMetadata,
 * then calls the sole machine pending writer `insertIngestedOffer`.
 *
 * NO second writer. NO status approved. NO Distribution/Rewards/Settlement.
 * S6.1 (evaluateMachineCandidateGate) is mandatory before mint — same contract as Hunter worker.
 */

import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import {
  insertIngestedOffer,
  type InsertIngestOptions,
  type InsertIngestResult,
} from '@/lib/bots/ingest/insertIngestedOffer';
import {
  evaluateMachineLiveInsertEligibility,
  isMachinePendingWriteEnabled,
} from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { resolveBotAuthorUserId } from '@/lib/bots/ingest/resolveBotAuthorUserId';
import { assertDedicatedMachineAuthor } from '@/lib/bots/ingest/stagingSupplyWindow';
import type { OpportunityCandidate } from '@/lib/supply/intelligence/types';
import type { OpportunityEvaluation } from '@/lib/supply/intelligence/types';
import type { OfferQualitySignals } from '@/lib/bots/ingest/offerQualitySignals';
import { createServerClient } from '@/lib/supabase/server';
import { isSuppressedByNegativeMemory } from '@/lib/discovery/negativeMemory';
import { evaluateDealQualityFromParsedMeta } from '@/lib/hunter/dealQuality';
import {
  buildHunterDecisionTrace,
  type HunterDecisionTrace,
} from '@/lib/bots/ingest/hunterDecisionTrace';
import type { CandidateGateResult } from '@/lib/bots/ingest/candidateInsertGate';

export type BuildParsedMetaInput = {
  candidate: OpportunityCandidate;
  evaluation: OpportunityEvaluation;
  /** Hunter / source id for bot_meta audit — never invents URLs. */
  sourceId?: string | null;
  hunterId?: string | null;
};

function inferStore(url: string, store?: string | null): string {
  if (store?.trim()) return store.trim().slice(0, 200);
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('mercadolibre') || host.includes('mercado')) return 'Mercado Libre';
    if (host.includes('amazon')) return 'Amazon';
    return host.slice(0, 200) || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build ParsedOfferMetadata from S8 evidence. Never fabricates reference prices
 * or source URLs. Returns null when required fields are missing.
 */
export function buildParsedMetaFromOpportunity(
  input: BuildParsedMetaInput,
): ParsedOfferMetadata | null {
  const { candidate, evaluation } = input;
  const url = (evaluation.candidateUrl || candidate.canonicalUrl || candidate.url || '').trim();
  if (!url) return null;

  const sale = evaluation.evidence.salePrice.amount;
  if (sale == null || !(sale > 0)) return null;

  const title = (candidate.title ?? '').trim();
  if (!title) return null;

  const imageUrl = (candidate.imageUrl ?? '').trim();
  if (!imageUrl) return null;

  const ref = evaluation.evidence.referencePrice;
  const originalPrice =
    ref?.trusted && ref.amount != null && ref.amount > sale ? ref.amount : null;
  const discountPercent =
    originalPrice != null && originalPrice > 0
      ? Math.round(((originalPrice - sale) / originalPrice) * 100)
      : evaluation.evidence.discountPercent ?? 0;

  const signals: OfferQualitySignals = {
    ...(candidate.signals ?? {}),
    ...(evaluation.evidence.signals ?? {}),
    suspectedArtificialListPrice:
      evaluation.evidence.suspectedArtificialListPrice ||
      candidate.signals?.suspectedArtificialListPrice ||
      null,
    historyReady: evaluation.evidence.historyReady,
    ...(ref?.trusted && ref.kind === 'listing_card'
      ? { originalPriceProvenance: 'listing_card' as const }
      : {}),
    ...(ref?.trusted && ref.kind === 'source_explicit'
      ? { originalPriceProvenance: 'source_explicit' as const }
      : {}),
    ...(ref?.trusted && ref.kind === 'api_quote'
      ? { originalPriceProvenance: 'source_explicit' as const }
      : {}),
  };

  return {
    canonicalUrl: url,
    title: title.slice(0, 500),
    store: inferStore(url, candidate.store),
    imageUrl: imageUrl.slice(0, 2048),
    discountPrice: sale,
    originalPrice,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    signals,
  };
}

export type WritePendingViaS7BridgeOpts = {
  config: BotIngestConfig;
  meta: ParsedOfferMetadata;
  ingestSource?: string;
  ingestSourceDetail?: string;
  moderatorNote?: string;
  ingestScore?: number;
  /** Require dedicated machine author (staging canary). Default true. */
  requireDedicatedAuthor?: boolean;
};

export type S7BridgeWriteResult =
  | InsertIngestResult
  | {
      ok: false;
      error: string;
      code:
        | 'WRITE_BLOCKED'
        | 'INVALID_AUTHOR'
        | 'INVALID_META'
        | 'NEGATIVE_MEMORY'
        | 'S61_BLOCKED';
      gate?: CandidateGateResult;
      hunterDecisionTrace?: HunterDecisionTrace;
    };

/**
 * Evaluate S6.1 for an S7/S9 candidate. Fail-closed when evidence is insufficient.
 * Same authority as Hunter worker — not a parallel gate.
 */
export function evaluateS7BridgeS61Gate(input: {
  meta: ParsedOfferMetadata;
  config: BotIngestConfig;
  ingestSource?: string | null;
}): {
  live: ReturnType<typeof evaluateMachineLiveInsertEligibility>;
  dealQuality: ReturnType<typeof evaluateDealQualityFromParsedMeta>;
  hunterDecisionTrace: HunterDecisionTrace;
} {
  const dealQuality = evaluateDealQualityFromParsedMeta(input.meta, {
    source: input.ingestSource ?? 's9_supply_automation',
  });
  const live = evaluateMachineLiveInsertEligibility({
    url: input.meta.canonicalUrl,
    meta: input.meta,
    config: input.config,
    verifierDecision: 'pending',
    verifierReasons: [],
    duplicate: null,
    dealScore: null,
    dealQuality,
  });
  const hunterDecisionTrace = buildHunterDecisionTrace({
    meta: input.meta,
    gate: live.gate,
    dealQuality,
    dealScore: null,
  });
  return { live, dealQuality, hunterDecisionTrace };
}

/**
 * Canonical S9→S7 write. Must run inside `withMachinePendingWritesEnabled`
 * (or with BOT_INGEST_MACHINE_PENDING_WRITES already true for the process).
 * Always inserts status `pending` — only after S6.1 wouldInsert.
 */
export async function writePendingViaS7Bridge(
  opts: WritePendingViaS7BridgeOpts,
): Promise<S7BridgeWriteResult> {
  if (!isMachinePendingWriteEnabled()) {
    return {
      ok: false,
      error: 'BOT_INGEST_MACHINE_PENDING_WRITES_off',
      code: 'WRITE_BLOCKED',
    };
  }

  if (!opts.meta?.canonicalUrl?.trim()) {
    return {
      ok: false,
      error: 'missing_meta_url',
      code: 'INVALID_META',
    };
  }

  const authorId = resolveBotAuthorUserId(opts.config, opts.meta);
  if (!authorId) {
    return {
      ok: false,
      error: 'missing_bot_author',
      code: 'INVALID_AUTHOR',
    };
  }

  if (opts.requireDedicatedAuthor !== false) {
    const authorCheck = assertDedicatedMachineAuthor(authorId);
    if (!authorCheck.ok) {
      return {
        ok: false,
        error: authorCheck.reason ?? 'invalid_author',
        code: 'INVALID_AUTHOR',
      };
    }
  }

  // Discovery Intelligence: SUPPRESS cannot bypass via S9/S7 (ml_api path).
  try {
    const supabase = createServerClient();
    const nm = await isSuppressedByNegativeMemory({
      supabase,
      url: opts.meta.canonicalUrl,
    });
    if (nm.suppressed) {
      return {
        ok: false,
        error: `negative_memory:${nm.reason ?? 'suppress'}`,
        code: 'NEGATIVE_MEMORY',
      };
    }
  } catch {
    /* lookup failure: do not block all inserts */
  }

  // S6.1 mandatory — cannot mint without wouldInsert (fail closed).
  const { live, hunterDecisionTrace } = evaluateS7BridgeS61Gate({
    meta: opts.meta,
    config: opts.config,
    ingestSource: opts.ingestSource ?? 's9_supply_automation',
  });
  if (!live.eligible || live.wouldInsert !== true) {
    return {
      ok: false,
      error: `s61_blocked:${live.gateReason}`,
      code: 'S61_BLOCKED',
      gate: live.gate,
      hunterDecisionTrace,
    };
  }

  const insertOpts: InsertIngestOptions = {
    status: 'pending',
    ingestSource: opts.ingestSource ?? 's9_supply_automation',
    ingestSourceDetail: opts.ingestSourceDetail,
    moderatorNote: opts.moderatorNote ?? '[s9] supply automation pending',
    ingestScore: opts.ingestScore,
    gateAction: 'insert_pending',
    gateReason: live.gateReason || 's61_verified_opportunity',
    gateReasonCodes: live.reasonCodes,
    gate: live.gate,
  };

  return insertIngestedOffer(opts.meta, opts.config, insertOpts);
}
