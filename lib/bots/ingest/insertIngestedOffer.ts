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
import { inferOfferAutogroup } from '@/lib/offers/inferOfferAutogroup';
import { resolveBotInsertPublication } from './resolveBotInsertPublication';
import type { DuplicateOfferKind } from '@/lib/offers/findDuplicateOffer';
import { isSupplyOpportunity } from '@/lib/offers/supplyOpportunity';
import {
  assertMachineOfferWriteAuthorized,
  resolveMachineInsertStatus,
} from './machineWriteAuth';
import { formatOfferScopeCondition, inferBotOfferScope } from '@/lib/offerScope';
import { isSuppressedByNegativeMemory } from '@/lib/discovery/negativeMemory';

/** Columnas opcionales: si el esquema aún no las tiene, el insert se reintenta sin ellas. */
const OPTIONAL_COLUMNS = [
  'bot_meta',
  'link_mod_ok',
  'moderator_comment',
  'product_fingerprint',
  'original_offer_url',
] as const;

function hasMissingColumn(error: { message?: string } | null, columnName: string): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes(columnName.toLowerCase());
}

export type InsertIngestOptions = {
  status: 'pending' | 'approved';
  titleOverride?: string;
  ingestScore?: number;
  scoreBreakdown?: ScoreBreakdown;
  moderatorNote?: string;
  ingestSource?: string;
  ingestSourceDetail?: string;
  decision?: ScoreDecision;
  /** DealScore v1 advisory — never publishes. */
  dealScore?: DealScore | null;
  /** Compact RawObservation provenance for audit (hash/meta only). */
  rawObservation?: RawObservationProvenanceSlice | null;
  gateAction?: string | null;
  gateReason?: string | null;
};

export type InsertIngestResult =
  | { ok: true; offerId: string }
  | {
      ok: false;
      duplicate: true;
      duplicateKind: DuplicateOfferKind;
      /** El candidato descartado venía más barato que la oferta que bloquea. Solo métrica. */
      supplyOpportunity?: boolean;
    }
  | { ok: false; error: string; code?: 'NEGATIVE_MEMORY' };

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
  opts?: InsertIngestOptions
): Promise<InsertIngestResult> {
  // S9.1 defense-in-depth: sole machine writer requires explicit write auth.
  // AUTO_APPROVE decision never bypasses this gate.
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
    rawCanonical || meta.canonicalUrl
  );
  const supabase = createServerClient();

  // Defense-in-depth: SUPPRESS must not be bypassed by any machine insert path.
  const nm = await isSuppressedByNegativeMemory({ supabase, url: offerUrl });
  if (nm.suppressed) {
    return {
      ok: false,
      error: `negative_memory:${nm.reason ?? 'SUPPRESS'}`,
      code: 'NEGATIVE_MEMORY',
    };
  }

  const {
    findDuplicateOfferByUrl,
    strongProductFingerprintForUrl,
    isUniqueViolation,
    releaseExpiredFingerprintSlot,
  } = await import('@/lib/offers/findDuplicateOffer');
  const duplicate = await findDuplicateOfferByUrl(supabase, offerUrl);
  if (duplicate) {
    return {
      ok: false,
      duplicate: true,
      duplicateKind: duplicate.kind,
      // Se descarta igual: medir no es actuar. Ver lib/offers/supplyOpportunity.ts.
      supplyOpportunity: isSupplyOpportunity({
        candidatePrice: meta.discountPrice,
        existingPrice: duplicate.price,
      }),
    };
  }
  const productFingerprint = strongProductFingerprintForUrl(offerUrl);

  const categoryFromEnv =
    config.category && config.category.trim()
      ? normalizeCategoryForStorage(config.category.trim())
      : null;
  const categoryInferred = classifyBotCategoryForStorage(meta, config.techCategoryIdSet);
  const categoryBase = categoryFromEnv ?? categoryInferred;
  const hasOriginal = meta.originalPrice != null && meta.originalPrice > meta.discountPrice;
  // S9.1: approval *decision* may be auto_approve; mint is always pending.
  const requestedStatus = resolveMachineInsertStatus(opts?.status);
  const publication = resolveBotInsertPublication({
    requestedStatus,
    offerUrl,
  });
  const status = publication.status;
  const title = (opts?.titleOverride ?? meta.title).slice(0, 500);
  const description = buildBotOfferDescription(meta, categoryBase).slice(0, 2000);
  const autogroup = inferOfferAutogroup({
    title,
    store: meta.store,
    category: categoryBase,
    description,
  });
  const category = autogroup.category ?? categoryBase;
  const tags = autogroup.tags;
  const imageNormalized = normalizeOfferImageUrl(meta.imageUrl) ?? '';
  const botScope = inferBotOfferScope({ store: meta.store, url: offerUrl });
  const conditions = botScope ? formatOfferScopeCondition(botScope) : null;

  const expiresAt =
    status === 'approved' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  const catNote = category ? ` cat=${category}` : '';
  const moderatorComment = buildModeratorComment({
    status,
    titleOverride: opts?.titleOverride,
    ingestScore: opts?.ingestScore,
    scoreBreakdown: opts?.scoreBreakdown,
    moderatorNote: `${opts?.moderatorNote ?? ''}${catNote}`.trim() || undefined,
  });

  const botQuality = evaluateDealQualityFromParsedMeta(meta, {
    source: opts?.ingestSource ?? null,
    productFingerprint: productFingerprint ?? null,
  });
  recordDealQualityDecision(botQuality);

  const botMeta = buildBotMeta({
    meta,
    scoreBreakdown: opts?.scoreBreakdown,
    ingestSource: opts?.ingestSource,
    ingestSourceDetail: opts?.ingestSourceDetail,
    decision: opts?.decision,
    dealQuality: toDealQualityTelemetry(botQuality),
    dealScore: opts?.dealScore ?? null,
    rawObservation: opts?.rawObservation ?? null,
    gateAction: opts?.gateAction ?? null,
    gateReason: opts?.gateReason ?? null,
  });

  const payload: Record<string, unknown> = {
    title,
    price: meta.discountPrice,
    original_price: hasOriginal ? meta.originalPrice : null,
    store: meta.store.slice(0, 200),
    ...(category ? { category } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    status,
    created_by: authorId,
    image_url: imageNormalized.slice(0, 2048),
    offer_url: offerUrl,
    ...(originalOfferUrl ? { original_offer_url: originalOfferUrl.slice(0, 2048) } : {}),
    ...(productFingerprint ? { product_fingerprint: productFingerprint } : {}),
    description,
    ...(conditions ? { conditions } : {}),
    moderator_comment: moderatorComment,
    ...(botMeta ? { bot_meta: botMeta } : {}),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    ...(publication.linkModOk ? { link_mod_ok: true } : {}),
  };

  const attempt: Record<string, unknown> = { ...payload };
  let { data, error } = await supabase.from('offers').insert([attempt]).select('id').single();

  for (let retry = 0; error && retry < OPTIONAL_COLUMNS.length; retry += 1) {
    const missing = OPTIONAL_COLUMNS.find(
      (column) => column in attempt && hasMissingColumn(error, column)
    );
    if (!missing) break;
    delete attempt[missing];
    ({ data, error } = await supabase.from('offers').insert([attempt]).select('id').single());
  }

  if (error && isUniqueViolation(error)) {
    let releasedExpired = false;
    if (productFingerprint) {
      releasedExpired = await releaseExpiredFingerprintSlot(supabase, productFingerprint);
      if (releasedExpired) {
        ({ data, error } = await supabase.from('offers').insert([attempt]).select('id').single());
      }
    }
    if (error && isUniqueViolation(error)) {
      // Liberamos una caducada y aun así choca → el bloqueo venía de una fila caducada.
      // Si no liberamos nada es una carrera TOCTOU: la fila ganadora no se leyó.
      return {
        ok: false,
        duplicate: true,
        duplicateKind: releasedExpired ? 'expired' : 'unknown',
      };
    }
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  const id = (data as { id?: string })?.id;
  if (!id) {
    return { ok: false, error: 'Sin id tras insert' };
  }

  return { ok: true, offerId: id };
}
