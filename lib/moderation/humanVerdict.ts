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
 */
export function buildHumanVerdict(input: HumanVerdictInput): HumanVerdict {
  const trust = computeModerationTrust(input);
  const meta = parseBotMeta(input.bot_meta);
  const artificial = Boolean(meta?.signals?.suspectedArtificialListPrice);
  const effective = meta?.signals?.effectiveDiscountPercent;
  const noImage = !input.image_url?.trim();
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

  // low
  const detailParts: string[] = [];
  if (noImage) detailParts.push('No tiene foto.');
  if (!input.category?.trim()) detailParts.push('Falta categoría.');
  if (trust.ingestScore != null && trust.ingestScore < 58) {
    detailParts.push('Hay señales de que la oferta no es suficientemente atractiva.');
  }
  if (detailParts.length === 0) {
    detailParts.push('Faltan datos para estar seguros.');
  }

  return {
    tone: 'poor',
    headline: 'No parece una oferta suficientemente buena.',
    detail: detailParts.join(' '),
  };
}

function hasSuspiciousDiscountHuman(input: HumanVerdictInput): boolean {
  const price = Number(input.price ?? 0);
  const original = Number(input.original_price ?? 0);
  if (!Number.isFinite(price) || !Number.isFinite(original) || original <= price) return false;
  const pct = Math.round(((original - price) / original) * 100);
  return pct > 60;
}
