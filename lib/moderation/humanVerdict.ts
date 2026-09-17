import { computeModerationTrust, type ModerationTrustInput } from './confidenceBadge';
import { parseBotMeta } from './botFacts';

export type HumanVerdictTone = 'good' | 'caution' | 'poor';

export type HumanVerdict = {
  tone: HumanVerdictTone;
  /** Conclusión corta para el humano. */
  headline: string;
  /** Frase de apoyo; nunca menciona score/100. */
  detail: string;
};

export type HumanVerdictInput = ModerationTrustInput & {
  bot_meta?: unknown;
  title?: string | null;
};

/**
 * Traduce señales internas a una conclusión humana.
 * No expone score ni jerga de Price Intel.
 * Distingue INSUFFICIENT_EVIDENCE vs evidencia negativa (presentation only).
 */
export function buildHumanVerdict(input: HumanVerdictInput): HumanVerdict {
  const trust = computeModerationTrust(input);
  const meta = parseBotMeta(input.bot_meta);
  const artificial = Boolean(meta?.signals?.suspectedArtificialListPrice);
  const effective = meta?.signals?.effectiveDiscountPercent;
  const historyReady = meta?.signals?.historyReady === true;
  const historyExplicitlyMissing =
    input.is_bot === true &&
    meta?.signals != null &&
    meta.signals.historyReady === false;
  const noEffectiveSavings =
    input.is_bot === true &&
    (effective == null || !Number.isFinite(effective) || effective <= 0);
  const noImage = !input.image_url?.trim();
  const noCategory = !input.category?.trim();
  const price = Number(input.price ?? 0);
  const original = Number(input.original_price ?? 0);
  const hasDiscount = Number.isFinite(original) && original > price && price > 0;

  if (artificial) {
    return {
      tone: 'caution',
      headline: 'Hay algunas dudas. Revísala.',
      detail: 'El precio anterior podría no representar el precio habitual.',
    };
  }

  if (
    effective != null &&
    Number.isFinite(effective) &&
    hasDiscount &&
    input.is_bot
  ) {
    const cardPct = Math.round(((original - price) / original) * 100);
    if (cardPct - effective >= 25) {
      return {
        tone: 'caution',
        headline: 'Hay algunas dudas. Revísala.',
        detail: 'El descuento de la etiqueta parece más alto que el ahorro real.',
      };
    }
  }

  if (trust.level === 'high') {
    return {
      tone: 'good',
      headline: 'Parece una buena oferta.',
      detail: hasDiscount
        ? 'Parece un descuento consistente con el precio actual.'
        : 'Los datos básicos se ven en orden.',
    };
  }

  if (trust.level === 'medium') {
    return {
      tone: 'caution',
      headline: 'Hay algunas dudas. Revísala.',
      detail: hasSuspiciousDiscountHuman(input)
        ? 'El descuento es alto; conviene mirar el precio con cuidado.'
        : 'Hay señales mixtas. Si te convence el producto, puedes aprobar.',
    };
  }

  // low — separar evidencia insuficiente vs defectos / señales negativas.
  const insufficientParts: string[] = [];
  if (historyExplicitlyMissing) {
    insufficientParts.push('Sin historial de precio suficiente.');
  }
  if (noEffectiveSavings && (historyExplicitlyMissing || !historyReady)) {
    insufficientParts.push('Ahorro histórico no verificable.');
  }

  if (insufficientParts.length > 0 && !noImage) {
    return {
      tone: 'caution',
      headline: 'Evidencia insuficiente para concluir.',
      detail: insufficientParts.join(' '),
    };
  }

  const defectParts: string[] = [];
  if (noImage) defectParts.push('No tiene foto.');
  if (noCategory) defectParts.push('Falta categoría.');
  if (trust.ingestScore != null && trust.ingestScore < 58 && historyReady) {
    defectParts.push('Las señales disponibles no respaldan un buen deal.');
  }

  if (defectParts.length === 0 && insufficientParts.length > 0) {
    return {
      tone: 'caution',
      headline: 'Evidencia insuficiente para concluir.',
      detail: insufficientParts.join(' '),
    };
  }

  if (defectParts.length === 0) {
    defectParts.push('Faltan datos para estar seguros.');
  }

  return {
    tone: noImage || noCategory ? 'poor' : 'caution',
    headline:
      noImage || noCategory
        ? 'Faltan datos básicos.'
        : 'Evidencia insuficiente o señales débiles.',
    detail: [...insufficientParts, ...defectParts].join(' '),
  };
}

function hasSuspiciousDiscountHuman(input: HumanVerdictInput): boolean {
  const price = Number(input.price ?? 0);
  const original = Number(input.original_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(original) || original <= price) return false;
  const pct = Math.round(((original - price) / original) * 100);
  return pct > 60;
}
