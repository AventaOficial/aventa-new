/**
 * CazaOfertasss — FASE 4.1. Contrato de import manual (operador).
 *
 * Un ítem manual es INPUT NO CONFIABLE. Este esquema sólo fija la forma del
 * envelope; la validez de negocio la deciden los validators existentes
 * (`buildDealCandidate` → identity / price / evidence / scoring).
 *
 * Sin UI todavía. Formatos: json | csv. XLSX queda como extensión posterior.
 */

import { z } from 'zod';

import {
  MANUAL_DEAL_IMPORT_FORMATS,
  MANUAL_IMPORT_MAX_ITEMS,
  TITLE_MAX_LENGTH,
  URL_MAX_LENGTH,
} from '../constants';
import { isoTimestampSchema } from '../validation';

export type ManualDealImportFormat = (typeof MANUAL_DEAL_IMPORT_FORMATS)[number];

const rawPrice = z.union([z.number(), z.string()]);
const nullableInt = z.number().int().nullable().optional();
const nullableBool = z.boolean().nullable().optional();

/** Evidencia declarada por el operador (sin precios: viven a nivel de ítem). */
export const manualDealImportEvidenceSchema = z.object({
  source: z.string().trim().min(1).max(64),
  evidenceQuality: z.string().trim().min(1).max(32),
  priceConfidence: z.string().trim().min(1).max(32),
  historicalConfidence: z.string().trim().min(1).max(32),
  observationWindowDays: nullableInt,
  observationCount: nullableInt,
  couponApplied: nullableBool,
  promotionApplied: nullableBool,
  notes: z.string().trim().max(500).nullable().optional(),
});

export const manualDealImportItemSchema = z.object({
  /** Etiqueta del origen operador (p.ej. "ops_sheet_2026w38"). Sin secretos. */
  source: z.string().trim().min(1).max(64).nullable().optional(),
  store: z.string().trim().min(1).max(64),
  externalProductId: z.string().trim().max(128).nullable().optional(),
  canonicalUrl: z.string().trim().min(1).max(URL_MAX_LENGTH),
  title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
  currentPrice: rawPrice,
  referencePrice: rawPrice.nullable().optional(),
  currency: z.string().trim().min(1).max(8),
  capturedAt: isoTimestampSchema,
  evidence: manualDealImportEvidenceSchema,
  category: z.string().trim().max(64).nullable().optional(),
  availability: z.string().trim().max(32).nullable().optional(),
  seller: z
    .object({
      externalSellerId: z.string().trim().max(128).nullable().optional(),
      displayName: z.string().trim().max(200).nullable().optional(),
      trustClass: z.string().trim().max(32).nullable().optional(),
      reputationScore: z.number().finite().nullable().optional(),
    })
    .nullable()
    .optional(),
  /** Referencia opcional (identity_key o pid) a un mapping operado. Informativa: el resolver decide. */
  affiliateMappingRef: z.string().trim().max(200).nullable().optional(),
});

export type ManualDealImportItem = z.infer<typeof manualDealImportItemSchema>;

export const manualDealImportEnvelopeSchema = z.object({
  importId: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .regex(/^[A-Za-z0-9._:-]+$/, 'importId inválido'),
  source: z.string().trim().min(1).max(64),
  format: z.enum(MANUAL_DEAL_IMPORT_FORMATS),
  receivedAt: isoTimestampSchema.optional(),
  /** Obligatorio. Nunca sin límite. */
  limit: z.number().int().min(1).max(MANUAL_IMPORT_MAX_ITEMS),
  items: z.array(z.unknown()),
});

export type ManualDealImportEnvelope = z.infer<typeof manualDealImportEnvelopeSchema>;

export interface ManualDealImportError {
  /** Índice del ítem (0-based). `-1` para errores del envelope. */
  readonly index: number;
  readonly reasonCode: string;
  /** Reasons adicionales del dominio (acotadas). Sin secretos. */
  readonly reasons: readonly string[];
}

export interface ManualDealImportReport {
  readonly importId: string;
  readonly source: string;
  readonly format: ManualDealImportFormat;
  readonly limit: number;
  readonly received: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly conflicts: number;
  readonly errors: readonly ManualDealImportError[];
  readonly preparedAt: string;
}

/** Esquemas de URL que jamás se aceptan, incluso antes de parsear. */
export const FORBIDDEN_URL_SCHEMES = ['javascript:', 'data:', 'file:', 'http:', 'ftp:', 'blob:'] as const;

export function detectForbiddenUrlScheme(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const lowered = raw.trim().toLowerCase().replace(/^[\s\u0000-\u001f]+/, '');
  for (const scheme of FORBIDDEN_URL_SCHEMES) {
    if (lowered.startsWith(scheme)) return scheme.slice(0, -1);
  }
  return null;
}
