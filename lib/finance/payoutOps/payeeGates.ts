/**
 * Gates por beneficiario — puro.
 * Orden y semántica: docs/SYSTEMS/SYSTEM_payout_operations.md §4
 * `fail` nunca se auto-resuelve; `review` lo resuelve finance; `pass` es lo único
 * que un proveedor real enviaría sin intervención.
 */

import { validateClabe, validateRfc } from '@/lib/commissions/fiscal';
import type { PayeeGateCode, PayeeGateInput, PayeeGateResult } from './types';

const GATE_MESSAGES: Record<PayeeGateCode, string> = {
  below_minimum: 'Saldo por debajo del mínimo de retiro; se acumula al siguiente periodo.',
  fiscal_incomplete: 'Faltan nombre legal o RFC válido.',
  clabe_missing: 'No hay CLABE registrada.',
  clabe_invalid: 'CLABE con dígito verificador incorrecto.',
  terms_missing: 'No ha aceptado los términos del programa.',
  terms_outdated: 'Aceptó una versión anterior de los términos.',
  rfc_duplicate: 'El RFC aparece en más de una cuenta.',
  clawback_pending: 'Tiene ajustes de clawback abiertos.',
  fraud_flags: 'Recompensas con señales de fraude (self_click / anonymous_click).',
  first_payout: 'Primer pago: SPEI es irrevocable, requiere revisión humana.',
  bank_details_changed: 'Datos bancarios actualizados después del último pago.',
};

function isAfter(a: string | null, b: string | null): boolean {
  if (!a) return false;
  if (!b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta > tb;
}

export function payeeGateMessage(code: PayeeGateCode): string {
  return GATE_MESSAGES[code];
}

export function evaluatePayeeGates(input: PayeeGateInput): PayeeGateResult {
  const fail: PayeeGateCode[] = [];
  const review: PayeeGateCode[] = [];

  if (input.amountCents < input.minPayoutCents) {
    return {
      decision: 'carry',
      codes: ['below_minimum'],
      reasons: [GATE_MESSAGES.below_minimum],
    };
  }

  const legalOk = !!input.legalName && input.legalName.trim().length >= 5;
  const rfcOk = !!input.rfc && validateRfc(input.rfc);
  if (!legalOk || !rfcOk) fail.push('fiscal_incomplete');

  if (!input.clabe) fail.push('clabe_missing');
  else if (!validateClabe(input.clabe)) fail.push('clabe_invalid');

  if (!input.termsAcceptedAt) fail.push('terms_missing');
  else if (input.termsVersion && input.termsVersion !== input.requiredTermsVersion) {
    fail.push('terms_outdated');
  } else if (!input.termsVersion) {
    fail.push('terms_outdated');
  }

  if (input.rfcDuplicate) fail.push('rfc_duplicate');

  if (fail.length > 0) {
    return { decision: 'fail', codes: fail, reasons: fail.map((c) => GATE_MESSAGES[c]) };
  }

  if (input.pendingClawbackCents > 0) review.push('clawback_pending');
  if (input.fraudFlags.length > 0) review.push('fraud_flags');
  if (input.priorPaidCount === 0) review.push('first_payout');
  if (input.priorPaidCount > 0 && isAfter(input.fiscalUpdatedAt, input.lastPaidAt)) {
    review.push('bank_details_changed');
  }

  if (review.length > 0) {
    return { decision: 'review', codes: review, reasons: review.map((c) => GATE_MESSAGES[c]) };
  }

  return { decision: 'pass', codes: [], reasons: [] };
}
