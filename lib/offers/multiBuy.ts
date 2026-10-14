/**
 * Promociones NxM (2x1, 3x2…) declaradas por un bot.
 * El bot sólo declara; el precio unitario es el que verificó la ficha y el precio efectivo
 * sólo se publica cuando un moderador lo confirma.
 */

export const MULTI_BUY_MIN_BUY = 2;
export const MULTI_BUY_MAX_BUY = 10;

export type MultiBuyStatus = 'pending_confirmation' | 'confirmed' | 'rejected';

export type MultiBuyMeta = {
  label: string;
  buy: number;
  pay: number;
  unit_price: number;
  effective_unit_price: number;
  status: MultiBuyStatus;
  /** Texto que se escribió en `offers.conditions` al confirmar. */
  conditions_text?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
};

const STATUSES: readonly MultiBuyStatus[] = ['pending_confirmation', 'confirmed', 'rejected'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isValidMultiBuy(buy: unknown, pay: unknown): buy is number {
  return (
    Number.isInteger(buy) &&
    Number.isInteger(pay) &&
    (buy as number) >= MULTI_BUY_MIN_BUY &&
    (buy as number) <= MULTI_BUY_MAX_BUY &&
    (pay as number) >= 1 &&
    (pay as number) < (buy as number)
  );
}

export function multiBuyLabel(buy: number, pay: number): string {
  return `${buy}x${pay}`;
}

export function effectiveUnitPrice(unitPrice: number, buy: number, pay: number): number {
  return round2((unitPrice * pay) / buy);
}

export function buildPendingMultiBuy(unitPrice: number, buy: number, pay: number): MultiBuyMeta {
  return {
    label: multiBuyLabel(buy, pay),
    buy,
    pay,
    unit_price: round2(unitPrice),
    effective_unit_price: effectiveUnitPrice(unitPrice, buy, pay),
    status: 'pending_confirmation',
  };
}

function money(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Línea para la nota interna del moderador. */
export function multiBuyModeratorLine(meta: MultiBuyMeta): string {
  return `Promoción ${meta.label} declarada por el bot: precio efectivo ${money(meta.effective_unit_price)} por pieza. Confírmala en la ficha antes de aprobar.`;
}

/** Texto público en `offers.conditions` cuando el moderador confirma. */
export function multiBuyConditionsText(meta: Pick<MultiBuyMeta, 'label' | 'buy' | 'pay' | 'effective_unit_price'>): string {
  return `Promoción ${meta.label}: llevas ${meta.buy} y pagas ${meta.pay}. Precio efectivo ${money(meta.effective_unit_price)} por pieza.`;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function parseMultiBuyMeta(botMeta: unknown): MultiBuyMeta | null {
  if (!botMeta || typeof botMeta !== 'object' || Array.isArray(botMeta)) return null;
  const raw = (botMeta as Record<string, unknown>).multi_buy;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (!isValidMultiBuy(m.buy, m.pay)) return null;
  const unit = num(m.unit_price);
  const effective = num(m.effective_unit_price);
  const status = STATUSES.find((s) => s === m.status);
  if (unit == null || effective == null || !status) return null;
  const pay = m.pay as number;
  return {
    label: multiBuyLabel(m.buy, pay),
    buy: m.buy,
    pay,
    unit_price: unit,
    effective_unit_price: effective,
    status,
    conditions_text: typeof m.conditions_text === 'string' ? m.conditions_text : null,
    decided_by: typeof m.decided_by === 'string' ? m.decided_by : null,
    decided_at: typeof m.decided_at === 'string' ? m.decided_at : null,
  };
}
