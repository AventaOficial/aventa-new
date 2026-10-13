import { AVENTA_MERCADOLIBRE_AFFILIATE_TOOL } from '@/lib/affiliate/mercadoLibreAffiliateAccount';
import type { MeliLaPasteVerification } from '@/lib/affiliate/verifyMeliLaPaste';

export type AffiliateCheckTone = 'ok' | 'warn' | 'bad';

export type AffiliateCheckLine = { label: string; value: string; tone: AffiliateCheckTone };

export type AffiliateVerificationSummary = {
  headline: string;
  tone: AffiliateCheckTone;
  lines: AffiliateCheckLine[];
  /** Aprobar exige confirmación manual explícita del moderador. */
  requiresManualConfirmation: boolean;
};

function accountLine(v: MeliLaPasteVerification): AffiliateCheckLine {
  const who = v.affiliateWord ? `${v.affiliateWord} (${v.affiliateTool})` : v.affiliateTool;
  if (v.accountVerified) {
    return { label: 'Cuenta afiliada', value: `✓ Aventa · ${who}`, tone: 'ok' };
  }
  if (v.affiliateTool && v.affiliateTool !== AVENTA_MERCADOLIBRE_AFFILIATE_TOOL) {
    return { label: 'Cuenta afiliada', value: `✕ Otra cuenta · ${who}`, tone: 'bad' };
  }
  if (v.status === 'rejected') {
    return { label: 'Cuenta afiliada', value: '✕ Sin afiliado', tone: 'bad' };
  }
  return { label: 'Cuenta afiliada', value: '? No se pudo comprobar', tone: 'warn' };
}

function productLine(v: MeliLaPasteVerification): AffiliateCheckLine {
  if (v.productVerified) return { label: 'Producto', value: '✓ Coincide con el original', tone: 'ok' };
  if (v.status === 'rejected' && v.accountVerified) {
    return { label: 'Producto', value: '✕ Es otro producto', tone: 'bad' };
  }
  return { label: 'Producto', value: '? No se pudo comprobar', tone: 'warn' };
}

/** Texto para moderación. Nunca dice "verificado" si la comprobación automática no ocurrió. */
export function summarizeAffiliateVerification(
  v: MeliLaPasteVerification
): AffiliateVerificationSummary {
  const lines = [accountLine(v), productLine(v)];
  if (v.status === 'verified') {
    return {
      headline: 'Verificado automáticamente',
      tone: 'ok',
      lines,
      requiresManualConfirmation: false,
    };
  }
  if (v.status === 'needs_manual_review') {
    return {
      headline: `Revisión manual requerida: ${v.reason ?? 'no se pudo comprobar'}`,
      tone: 'warn',
      lines,
      requiresManualConfirmation: true,
    };
  }
  return {
    headline: v.reason ?? 'Enlace rechazado',
    tone: 'bad',
    lines,
    requiresManualConfirmation: false,
  };
}

export function isMeliLaPasteVerification(value: unknown): value is MeliLaPasteVerification {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'verified' || v.status === 'needs_manual_review' || v.status === 'rejected') &&
    typeof v.accountVerified === 'boolean' &&
    typeof v.productVerified === 'boolean'
  );
}
