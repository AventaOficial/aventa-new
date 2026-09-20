/**
 * CazaOfertasss — FASE 4.1. Preparación de un import manual.
 *
 * Envelope (ítems crudos) → drafts aceptados + reporte de operador.
 *
 * Toda decisión de validez la toman las autoridades existentes:
 *   - forma          → contract.ts (zod)
 *   - URL / identidad → identity.ts vía buildDealCandidate
 *   - precio / moneda → price.ts vía buildDealCandidate
 *   - evidencia       → evidence.ts (`validateEvidence`, staleness)
 *
 * Bounded: `limit` obligatorio (≤ MANUAL_IMPORT_MAX_ITEMS). Un import mayor se
 * rechaza completo, sin procesar parcialmente.
 * Idempotente: misma identidad repetida ⇒ duplicate (no segundo draft);
 * misma identidad con canonical URL distinta ⇒ conflict (rechazo explícito).
 */

import { buildDealCandidate } from '../candidate';
import { MANUAL_IMPORT_MAX_ITEMS, MANUAL_IMPORT_MAX_REPORT_ERRORS } from '../constants';
import type { DealCandidateRepository } from '../dedupe';
import { validateEvidence } from '../evidence';
import { normalizePrice } from '../price';
import type {
  CazaResult,
  CazaStoreId,
  DealCandidateDraft,
  DealEvidence,
  SellerTrustClass,
} from '../types';
import { failResult, okResult } from '../types';
import { parseWithSchema } from '../validation';
import {
  detectForbiddenUrlScheme,
  manualDealImportEnvelopeSchema,
  manualDealImportItemSchema,
  type ManualDealImportEnvelope,
  type ManualDealImportError,
  type ManualDealImportItem,
  type ManualDealImportReport,
} from './contract';

export interface PreparedManualDealDraft {
  readonly index: number;
  readonly identityKey: string;
  readonly store: CazaStoreId;
  readonly draft: DealCandidateDraft;
  readonly affiliateMappingRef: string | null;
}

export interface PreparedManualDealImport {
  readonly report: ManualDealImportReport;
  readonly drafts: readonly PreparedManualDealDraft[];
}

export interface PrepareManualDealImportOptions {
  readonly now: Date;
  /**
   * Opcional: repositorio de candidatos existente para detectar conflicto de
   * identidad contra lo ya persistido (misma identity, canonical URL distinta).
   * Lookups puntuales, acotados por `limit`.
   */
  readonly existingCandidates?: DealCandidateRepository | null;
}

function safeReason(reason: string): string {
  // Reasons del dominio nunca incluyen secretos, pero acotamos longitud por higiene.
  return reason.length > 160 ? `${reason.slice(0, 157)}...` : reason;
}

function itemToDraft(item: ManualDealImportItem): CazaResult<DealCandidateDraft> {
  const current = normalizePrice(item.currentPrice);
  if (!current.ok) return failResult(current.reasons);
  let reference: number | null = null;
  if (item.referencePrice !== null && item.referencePrice !== undefined) {
    const ref = normalizePrice(item.referencePrice);
    if (!ref.ok) return failResult(ref.reasons.map((r) => `reference_${r}`));
    reference = ref.value;
  }

  const evidence = {
    source: item.evidence.source,
    capturedAt: item.capturedAt,
    currentPrice: current.value,
    referencePrice: reference,
    currency: item.currency,
    evidenceQuality: item.evidence.evidenceQuality,
    priceConfidence: item.evidence.priceConfidence,
    historicalConfidence: item.evidence.historicalConfidence,
    observationWindowDays: item.evidence.observationWindowDays ?? null,
    observationCount: item.evidence.observationCount ?? null,
    couponApplied: item.evidence.couponApplied ?? false,
    promotionApplied: item.evidence.promotionApplied ?? false,
    ...(item.evidence.notes ? { notes: item.evidence.notes } : {}),
  } as DealEvidence;

  return okResult({
    store: item.store as CazaStoreId,
    externalProductId: item.externalProductId ?? null,
    title: item.title,
    url: item.canonicalUrl,
    currentPrice: current.value,
    referencePrice: reference,
    currency: item.currency,
    category: item.category ?? null,
    seller: item.seller
      ? {
          externalSellerId: item.seller.externalSellerId ?? null,
          displayName: item.seller.displayName ?? null,
          // Lenient a propósito: `coerceSellerTrustClass` degrada valores desconocidos a `unknown`.
          trustClass: (item.seller.trustClass ?? 'unknown') as SellerTrustClass,
          reputationScore: item.seller.reputationScore ?? null,
        }
      : null,
    availability: item.availability ?? null,
    evidence,
    detectedAt: item.capturedAt,
  });
}

export async function prepareManualDealImport(
  rawEnvelope: ManualDealImportEnvelope | unknown,
  options: PrepareManualDealImportOptions
): Promise<PreparedManualDealImport> {
  const preparedAt = options.now.toISOString();
  const envelopeParsed = parseWithSchema(manualDealImportEnvelopeSchema, rawEnvelope);
  if (!envelopeParsed.ok) {
    const partial = (rawEnvelope ?? {}) as Partial<ManualDealImportEnvelope>;
    const received = Array.isArray(partial.items) ? partial.items.length : 0;
    return {
      drafts: [],
      report: {
        importId: typeof partial.importId === 'string' ? partial.importId.slice(0, 64) : 'invalid',
        source: typeof partial.source === 'string' ? partial.source.slice(0, 64) : 'invalid',
        format: partial.format === 'csv' ? 'csv' : 'json',
        limit: 0,
        received,
        accepted: 0,
        rejected: received,
        duplicates: 0,
        conflicts: 0,
        errors: [
          {
            index: -1,
            reasonCode: 'manual_import.envelope_invalid',
            reasons: envelopeParsed.reasons.slice(0, 10).map(safeReason),
          },
        ],
        preparedAt,
      },
    };
  }

  const envelope = envelopeParsed.value;
  const limit = Math.min(envelope.limit, MANUAL_IMPORT_MAX_ITEMS);
  const received = envelope.items.length;
  const errors: ManualDealImportError[] = [];
  let accepted = 0;
  let rejected = 0;
  let duplicates = 0;
  let conflicts = 0;

  const pushError = (index: number, reasonCode: string, reasons: readonly string[] = []) => {
    if (errors.length < MANUAL_IMPORT_MAX_REPORT_ERRORS) {
      errors.push({
        index,
        reasonCode: safeReason(reasonCode),
        reasons: reasons.slice(0, 8).map(safeReason),
      });
    }
  };

  const buildReport = (): ManualDealImportReport => ({
    importId: envelope.importId,
    source: envelope.source,
    format: envelope.format,
    limit,
    received,
    accepted,
    rejected,
    duplicates,
    conflicts,
    errors,
    preparedAt,
  });

  // Bounded: más ítems que el límite ⇒ rechazo completo (sin procesar parcialmente).
  if (received > limit) {
    rejected = received;
    pushError(-1, `manual_import.limit_exceeded:${received}>${limit}`);
    return { drafts: [], report: buildReport() };
  }

  const drafts: PreparedManualDealDraft[] = [];
  const seen = new Map<string, { index: number; canonicalUrl: string }>();

  for (let index = 0; index < envelope.items.length; index += 1) {
    const raw = envelope.items[index];

    const scheme = detectForbiddenUrlScheme((raw as { canonicalUrl?: unknown } | null)?.canonicalUrl);
    if (scheme) {
      rejected += 1;
      pushError(index, `manual_import.url_scheme_forbidden:${scheme}`);
      continue;
    }

    const itemParsed = parseWithSchema(manualDealImportItemSchema, raw);
    if (!itemParsed.ok) {
      rejected += 1;
      pushError(index, 'manual_import.item_invalid', itemParsed.reasons);
      continue;
    }
    const item = itemParsed.value;

    const draftResult = itemToDraft(item);
    if (!draftResult.ok) {
      rejected += 1;
      pushError(index, draftResult.reasons[0] ?? 'manual_import.item_invalid', draftResult.reasons);
      continue;
    }
    const draft = draftResult.value;

    // Descuento imposible: referencia declarada que no supera el precio actual.
    if (
      typeof draft.referencePrice === 'number' &&
      typeof draft.currentPrice === 'number' &&
      draft.referencePrice <= draft.currentPrice
    ) {
      rejected += 1;
      pushError(index, 'manual_import.reference_not_above_current');
      continue;
    }

    // Autoridad completa del dominio (store, URL, identidad, precio, moneda, evidencia).
    const built = buildDealCandidate(draft, { now: options.now, affiliate: null });
    if (!built.ok) {
      rejected += 1;
      pushError(index, built.reasons[0] ?? 'candidate.invalid', built.reasons);
      continue;
    }
    const candidate = built.value;

    // Evidencia obsoleta / futura / incoherente ⇒ rechazo (no se importa lo que no se puede publicar).
    const evidenceCheck = validateEvidence(candidate.evidence, options.now);
    if (evidenceCheck.stale || !evidenceCheck.usable) {
      rejected += 1;
      pushError(
        index,
        evidenceCheck.stale ? 'evidence.stale' : evidenceCheck.reasons[0] ?? 'evidence.unusable',
        evidenceCheck.reasons
      );
      continue;
    }

    // Idempotencia dentro del import.
    const key = candidate.identity.key;
    const prior = seen.get(key);
    if (prior) {
      if (prior.canonicalUrl === candidate.canonicalUrl) {
        duplicates += 1;
      } else {
        conflicts += 1;
        pushError(index, 'manual_import.identity_conflict', [
          `manual_import.conflicts_with_index:${prior.index}`,
        ]);
      }
      continue;
    }

    // Conflicto contra lo ya persistido (misma identidad, URL canónica distinta).
    if (options.existingCandidates) {
      let existing = null;
      try {
        existing = await options.existingCandidates.findByIdentityKey(key);
      } catch (err) {
        rejected += 1;
        pushError(index, 'manual_import.existing_lookup_failed', [
          safeReason(err instanceof Error ? err.message : 'unknown'),
        ]);
        continue;
      }
      if (existing && existing.canonicalUrl !== candidate.canonicalUrl) {
        conflicts += 1;
        pushError(index, 'manual_import.identity_conflict_existing');
        continue;
      }
    }

    seen.set(key, { index, canonicalUrl: candidate.canonicalUrl });
    accepted += 1;
    drafts.push({
      index,
      identityKey: key,
      store: candidate.store,
      draft,
      affiliateMappingRef: item.affiliateMappingRef ?? null,
    });
  }

  return { drafts, report: buildReport() };
}
