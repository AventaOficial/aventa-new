import { multiBuyConditionsText, parseMultiBuyMeta, type MultiBuyMeta } from '@/lib/offers/multiBuy';

export type MultiBuyDecisionInput = {
  botMeta: unknown;
  conditions: string | null;
  /** Precio por pieza de la oferta (verificado en la ficha). */
  price: number;
  decision: 'confirm' | 'reject';
  /** Precio efectivo que fija el moderador; si falta, se usa el calculado. */
  effectiveUnitPrice?: unknown;
  actorId: string;
  now: Date;
};

export type MultiBuyDecision =
  | { ok: true; botMeta: Record<string, unknown>; conditions: string | null; multiBuy: MultiBuyMeta }
  | { ok: false; error: string };

/** Quita de `conditions` el texto que escribió una confirmación anterior. */
function withoutPreviousText(conditions: string | null, previous: string | null | undefined): string | null {
  const current = conditions?.trim() ?? '';
  if (!current) return null;
  if (!previous) return current;
  const rest = current.split(previous).join('').trim();
  return rest || null;
}

export function decideMultiBuy(input: MultiBuyDecisionInput): MultiBuyDecision {
  const meta = parseMultiBuyMeta(input.botMeta);
  if (!meta) return { ok: false, error: 'Esta oferta no tiene una promoción por confirmar' };
  const base = withoutPreviousText(input.conditions, meta.conditions_text);
  const decidedAt = input.now.toISOString();

  if (input.decision === 'reject') {
    const multiBuy: MultiBuyMeta = { ...meta, status: 'rejected', conditions_text: null, decided_by: input.actorId, decided_at: decidedAt };
    return { ok: true, botMeta: { ...(input.botMeta as Record<string, unknown>), multi_buy: multiBuy }, conditions: base, multiBuy };
  }

  let effective = meta.effective_unit_price;
  if (input.effectiveUnitPrice !== undefined && input.effectiveUnitPrice !== null && input.effectiveUnitPrice !== '') {
    const n = Number(input.effectiveUnitPrice);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Precio efectivo inválido' };
    effective = Math.round(n * 100) / 100;
  }
  if (Number.isFinite(input.price) && input.price > 0 && effective > input.price) {
    return { ok: false, error: 'El precio efectivo no puede ser mayor que el precio por pieza' };
  }
  const text = multiBuyConditionsText({ ...meta, effective_unit_price: effective });
  const multiBuy: MultiBuyMeta = {
    ...meta,
    effective_unit_price: effective,
    status: 'confirmed',
    conditions_text: text,
    decided_by: input.actorId,
    decided_at: decidedAt,
  };
  return {
    ok: true,
    botMeta: { ...(input.botMeta as Record<string, unknown>), multi_buy: multiBuy },
    conditions: base ? `${text}\n${base}` : text,
    multiBuy,
  };
}
