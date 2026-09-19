/**
 * CazaOfertasss — FASE 0. Frontera de entrada.
 *
 * TODO input externo es no confiable: adapters, pegados de operador, webhooks
 * de redes de afiliados. Este archivo es la única puerta de entrada tipada.
 *
 * No se validan secretos aquí: los secretos se referencian por nombre de env
 * var y nunca atraviesan este contrato.
 */

import { z } from 'zod';

import {
  CAZAOFERTAS_CURRENCIES,
  CAZAOFERTAS_STORES,
  EXTERNAL_PRODUCT_ID_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  TRACKING_LABEL_PATTERN,
  URL_MAX_LENGTH,
} from './constants';
import type { CazaCategoryId, CazaResult, DealAvailability, SellerTrustClass } from './types';
import { failResult, okResult } from './types';

export const storeIdSchema = z.enum(CAZAOFERTAS_STORES);
export const currencySchema = z.enum(CAZAOFERTAS_CURRENCIES);

export const categorySchema = z.enum([
  'electronics',
  'computing',
  'home',
  'appliances',
  'beauty',
  'fashion',
  'toys',
  'sports',
  'grocery',
  'tools',
  'other',
]);

export const availabilitySchema = z.enum(['in_stock', 'low_stock', 'out_of_stock', 'unknown']);

export const sellerTrustClassSchema = z.enum([
  'official_store',
  'high',
  'medium',
  'low',
  'unknown',
]);

export const evidenceSourceSchema = z.enum([
  'store_official_api',
  'store_product_page',
  'page_claim',
  'internal_price_history',
  'operator_manual_entry',
]);

export const evidenceQualitySchema = z.enum(['strong', 'moderate', 'weak', 'unusable']);
export const priceConfidenceSchema = z.enum(['verified', 'reported', 'unverified']);
export const historicalConfidenceSchema = z.enum([
  'observed_history',
  'store_reference_price',
  'page_claimed',
  'none',
]);

/** Sólo https, longitud acotada, sin credenciales embebidas. */
export const externalUrlSchema = z
  .string({ error: 'La URL es obligatoria' })
  .trim()
  .min(1, 'La URL es obligatoria')
  .max(URL_MAX_LENGTH, 'La URL es demasiado larga')
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === 'https:' &&
        parsed.username.length === 0 &&
        parsed.password.length === 0
      );
    } catch {
      return false;
    }
  }, 'La URL debe ser https y no puede incluir credenciales');

export const isoTimestampSchema = z
  .string({ error: 'La fecha es obligatoria' })
  .trim()
  .refine((value) => Number.isFinite(Date.parse(value)), 'La fecha no es válida');

export const externalProductIdSchema = z
  .string()
  .trim()
  .min(1, 'El ID externo no puede estar vacío')
  .max(EXTERNAL_PRODUCT_ID_MAX_LENGTH, 'El ID externo es demasiado largo')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'El ID externo tiene caracteres inválidos');

export const trackingLabelSchema = z
  .string()
  .trim()
  .regex(TRACKING_LABEL_PATTERN, 'La etiqueta de tracking tiene formato inválido');

/** Referencia a env var, nunca el valor del secreto. */
export const credentialRefSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{3,64}$/, 'La referencia de credencial debe ser un nombre de env var');

/** Precio crudo: número o string. La normalización real vive en `price.ts`. */
const rawPriceSchema = z.union([z.number(), z.string()], {
  error: 'El precio debe ser número o texto numérico',
});

export const evidenceSchema = z.object({
  source: evidenceSourceSchema,
  capturedAt: isoTimestampSchema,
  currentPrice: z.number().finite(),
  referencePrice: z.number().finite().nullable(),
  currency: currencySchema,
  evidenceQuality: evidenceQualitySchema,
  priceConfidence: priceConfidenceSchema,
  historicalConfidence: historicalConfidenceSchema,
  observationWindowDays: z.number().int().nullable(),
  observationCount: z.number().int().nullable(),
  couponApplied: z.boolean(),
  promotionApplied: z.boolean(),
  notes: z.string().max(500).optional(),
});

export const dealCandidateDraftSchema = z.object({
  store: storeIdSchema,
  externalProductId: externalProductIdSchema.nullable().optional(),
  title: z
    .string({ error: 'El título es obligatorio' })
    .trim()
    .min(1, 'El título es obligatorio')
    .max(TITLE_MAX_LENGTH, 'El título es demasiado largo'),
  url: externalUrlSchema,
  currentPrice: rawPriceSchema,
  referencePrice: rawPriceSchema.nullable().optional(),
  currency: z.string(),
  category: z.string().nullable().optional(),
  seller: z
    .object({
      externalSellerId: z.string().trim().max(128).nullable().optional(),
      displayName: z.string().trim().max(200).nullable().optional(),
      // Lenient a propósito: un valor desconocido degrada a `unknown` vía
      // `coerceSellerTrustClass`, nunca "hacia arriba".
      trustClass: z.string().nullable().optional(),
      reputationScore: z.number().finite().nullable().optional(),
    })
    .nullable()
    .optional(),
  availability: z.string().nullable().optional(),
  evidence: evidenceSchema,
  detectedAt: isoTimestampSchema.optional(),
});

export type ValidatedDealCandidateDraft = z.infer<typeof dealCandidateDraftSchema>;

/** Adapta un `ZodError` al `CazaResult` del dominio, sin filtrar el input. */
export function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): CazaResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return okResult(parsed.data);
  const reasons = parsed.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `input.${path}:${issue.code}`;
  });
  return failResult(reasons.length > 0 ? reasons : ['input.invalid']);
}

/** Categoría desconocida degrada a `other`; nunca lanza ni inventa relevancia. */
export function coerceCategory(raw: unknown): CazaCategoryId {
  const parsed = categorySchema.safeParse(typeof raw === 'string' ? raw.trim().toLowerCase() : raw);
  return parsed.success ? parsed.data : 'other';
}

/** Disponibilidad desconocida degrada a `unknown`, nunca a `in_stock`. */
export function coerceAvailability(raw: unknown): DealAvailability {
  const parsed = availabilitySchema.safeParse(
    typeof raw === 'string' ? raw.trim().toLowerCase() : raw
  );
  return parsed.success ? parsed.data : 'unknown';
}

/** Vendedor desconocido degrada a `unknown`, nunca a `high`. */
export function coerceSellerTrustClass(raw: unknown): SellerTrustClass {
  const parsed = sellerTrustClassSchema.safeParse(
    typeof raw === 'string' ? raw.trim().toLowerCase() : raw
  );
  return parsed.success ? parsed.data : 'unknown';
}
