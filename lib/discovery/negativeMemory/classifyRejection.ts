import type { RejectionSignalKind } from './types';
import { FOCUS_REJECTION_PRESETS, MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { AUTO_REJECTED_TIMEOUT_REASON } from '@/lib/offers/findDuplicateOffer';

const SPAM_FULL = FOCUS_REJECTION_PRESETS.find((p) => p.short === 'Spam')?.full ?? '';
const NOT_GOOD_FULL =
  FOCUS_REJECTION_PRESETS.find((p) => p.short === 'No es una buena oferta')?.full ?? '';
const DUPLICATE_FULL =
  FOCUS_REJECTION_PRESETS.find((p) => p.short === 'Duplicada')?.full ?? '';
const PRICE_FULL =
  FOCUS_REJECTION_PRESETS.find((p) => p.short === 'Precio engañoso')?.full ?? '';
const UNAVAILABLE_FULL =
  FOCUS_REJECTION_PRESETS.find((p) => p.short === 'Agotada')?.full ?? '';
const LEGACY_SPAM =
  MODERATION_REJECTION_PRESETS.find((p) => p.short === 'Spam / normas')?.full ?? '';

function includesNorm(hay: string, needle: string): boolean {
  if (!needle) return false;
  return hay.toLowerCase().includes(needle.toLowerCase().slice(0, 40));
}

/**
 * Clasifica rejection_reason / status hacia señales de Negative Memory.
 * auto_rejected_timeout NUNCA cuenta como spam.
 */
export function classifyRejectionSignal(params: {
  status: string | null | undefined;
  rejectionReason: string | null | undefined;
}): RejectionSignalKind {
  const status = (params.status ?? '').toLowerCase();
  if (status === 'approved' || status === 'published') return 'approved';
  if (status === 'pending') return 'pending';
  if (status !== 'rejected') return 'unknown';

  const reason = (params.rejectionReason ?? '').trim();
  if (!reason) return 'other_reject';
  if (reason === AUTO_REJECTED_TIMEOUT_REASON) return 'auto_rejected_timeout';

  const lower = reason.toLowerCase();
  if (
    includesNorm(lower, SPAM_FULL) ||
    includesNorm(lower, LEGACY_SPAM) ||
    /\bspam\b/i.test(reason)
  ) {
    return 'spam';
  }
  if (includesNorm(lower, NOT_GOOD_FULL) || /no es una buena oferta/i.test(reason)) {
    return 'not_good_offer';
  }
  if (includesNorm(lower, DUPLICATE_FULL) || /duplicad/i.test(reason)) {
    return 'duplicate';
  }
  if (includesNorm(lower, PRICE_FULL) || /engaños|precio.*no coincide/i.test(reason)) {
    return 'price_misleading';
  }
  if (includesNorm(lower, UNAVAILABLE_FULL) || /agotad|no disponible/i.test(reason)) {
    return 'unavailable';
  }
  if (/incorrecto|inválid|invalid|enlace/i.test(reason)) {
    return 'invalid';
  }
  return 'other_reject';
}

/** ¿Cuenta como señal fuerte para SUPPRESS (spam o reject humano)? */
export function isStrongNegativeSignal(kind: RejectionSignalKind): boolean {
  return (
    kind === 'spam' ||
    kind === 'not_good_offer' ||
    kind === 'duplicate' ||
    kind === 'price_misleading' ||
    kind === 'unavailable' ||
    kind === 'invalid' ||
    kind === 'other_reject'
  );
}

export function isSpamSignal(kind: RejectionSignalKind): boolean {
  return kind === 'spam';
}
