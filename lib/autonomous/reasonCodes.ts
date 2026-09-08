import type { AutonomousDecisionResult } from './types';

/**
 * Códigos de observabilidad. No son reglas nuevas: agrupan checks/reasons
 * que el motor V1 ya emite.
 */
export const SHADOW_REASON_CODES = [
  'missing_image',
  'seller_unknown',
  'duplicate_unknown',
  'duplicate_confirmed',
  'discount_gap',
  'artificial_list_price',
  'low_score',
  'low_confidence',
  'verifier_review',
  'missing_price',
  'invalid_url',
  'source_degraded',
  'other',
] as const;

export type ShadowReasonCode = (typeof SHADOW_REASON_CODES)[number];

export const SHADOW_REASON_LABELS: Record<ShadowReasonCode, string> = {
  missing_image: 'Imagen ausente o placeholder',
  seller_unknown: 'Vendedor/tienda desconocido',
  duplicate_unknown: 'Duplicado no verificado',
  duplicate_confirmed: 'Duplicado confirmado',
  discount_gap: 'Hueco de descuento sospechoso',
  artificial_list_price: 'Precio de lista artificial',
  low_score: 'Score bajo el umbral',
  low_confidence: 'Confidence baja',
  verifier_review: 'Deal Verifier no auto-aprueba',
  missing_price: 'Precio inválido o ausente',
  invalid_url: 'URL inválida o no producto',
  source_degraded: 'Fuente degradada o desconocida',
  other: 'Otra causa V1',
};

const CODE_SET = new Set<string>(SHADOW_REASON_CODES);

function blob(result: AutonomousDecisionResult): string {
  const parts = [
    ...result.reasons,
    ...Object.values(result.checks).map((c) => `${c.key} ${c.status} ${c.detail}`),
  ];
  return parts.join(' · ').toLowerCase();
}

function notPass(status: string): boolean {
  return status !== 'pass';
}

/**
 * Agrupa causas ya existentes. Determinista. Sin URLs. Sin IA.
 * AUTO_APPROVE → [].
 */
export function classifyShadowReasons(result: AutonomousDecisionResult): ShadowReasonCode[] {
  if (result.decision === 'AUTO_APPROVE') return [];

  const found = new Set<ShadowReasonCode>();
  const c = result.checks;
  const text = blob(result);

  if (c.image.status === 'warn' || c.image.status === 'unknown' || /imagen ausente|placeholder/i.test(text)) {
    found.add('missing_image');
  }
  if (c.seller.status === 'unknown' || c.seller.status === 'warn' || /vendedor desconocido|tienda\/vendedor/i.test(text)) {
    found.add('seller_unknown');
  }
  if (c.duplicate.status === 'unknown') found.add('duplicate_unknown');
  if (c.duplicate.status === 'fail' || /duplicado de oferta existente/i.test(text)) {
    found.add('duplicate_confirmed');
  }
  if (
    /hueco|gap|descuento sospechoso|discount gap/i.test(text) ||
    (c.discount.status === 'warn' && /gap|hueco/i.test(c.discount.detail))
  ) {
    found.add('discount_gap');
  }
  if (/lista artificial|artificial list|precio de lista artificial/i.test(text)) {
    found.add('artificial_list_price');
  }
  if (c.score.status === 'warn' || c.score.status === 'unknown') found.add('low_score');
  if (c.confidence.status === 'warn' || c.confidence.status === 'unknown') found.add('low_confidence');
  if (c.verifierDecision.status !== 'pass' || /deal verifier no auto-aprueba/i.test(text)) {
    found.add('verifier_review');
  }
  if (c.price.status === 'fail' || c.price.status === 'warn' || /precio actual inválido|sin precio/i.test(text)) {
    found.add('missing_price');
  }
  if (/url vacía|url inválida|no es producto|login\/verificación/i.test(text)) {
    found.add('invalid_url');
  }
  if (notPass(c.sourceHealth.status)) found.add('source_degraded');

  if (found.size === 0) found.add('other');

  return SHADOW_REASON_CODES.filter((code) => found.has(code));
}

export function isShadowReasonCode(raw: string): raw is ShadowReasonCode {
  return CODE_SET.has(raw);
}
