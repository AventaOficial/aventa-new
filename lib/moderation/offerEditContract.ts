/**
 * Contrato puro de edición de oferta en moderación.
 * No inventa columnas; valida solo campos del schema real.
 */

import { normalizeBankCoupon } from '@/lib/bankCoupons';

export type OfferEditSnapshot = {
  title?: string | null;
  price?: number | null;
  original_price?: number | null;
  description?: string | null;
  hunter_comment?: string | null;
  category?: string | null;
  image_url?: string | null;
  offer_url?: string | null;
  coupons?: string | null;
  bank_coupon?: string | null;
  msi_months?: number | null;
};

export type ParsedMoney = { ok: true; value: number } | { ok: false; error: string };

/** Precio MXN operacional: número finito ≥ 0, máx 2 decimales. */
export function parseOfferEditMoney(raw: unknown): ParsedMoney {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, error: 'Precio obligatorio' };
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/,/g, ''));
  if (!Number.isFinite(n)) return { ok: false, error: 'Escribe un precio válido, solo números' };
  if (n < 0) return { ok: false, error: 'El precio no puede ser negativo' };
  if (n > 1_000_000_000) return { ok: false, error: 'Precio fuera de rango' };
  const rounded = Math.round(n * 100) / 100;
  return { ok: true, value: rounded };
}

/** Descripción acotada, sin HTML/scripts. */
export function sanitizeOfferEditDescription(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  return stripped.length > 0 ? stripped : null;
}

/** Comentario del cazador (feed); vacío → null (limpia columna). */
export function sanitizeOfferEditHunterComment(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const stripped = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/javascript:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return stripped.length > 0 ? stripped : null;
}

export function sanitizeOfferEditCoupons(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  return t.length > 0 ? t : null;
}

/**
 * Cupón bancario (columna `offers.bank_coupon`).
 * null / '' → limpia. Slug inválido → error (no silent null).
 */
export function parseOfferEditBankCoupon(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Cupón bancario inválido' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const normalized = normalizeBankCoupon(trimmed);
  if (!normalized) {
    return { ok: false, error: 'Banco no reconocido. Elige uno del catálogo.' };
  }
  return { ok: true, value: normalized };
}

export {
  parseOfferEditMsiMonths,
  isValidMsiMonths,
  MSI_MONTHS_MIN,
  MSI_MONTHS_MAX,
} from '@/lib/offers/msiDisplay';

/** Cambios que afectan identidad comercial / evidencia de una oferta live. */
export function isMaterialOfferEdit(fields: ReadonlyArray<string>): boolean {
  return fields.some(
    (f) => f === 'price' || f === 'original_price' || f === 'offer_url' || f === 'image_url'
  );
}

export function buildOfferEditDiff(
  before: OfferEditSnapshot,
  after: Partial<OfferEditSnapshot>
): { fields: string[]; changes: Record<string, { from: unknown; to: unknown }> } {
  const fields: string[] = [];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after) as (keyof OfferEditSnapshot)[]) {
    const next = after[key];
    if (next === undefined) continue;
    const prev = before[key] ?? null;
    const normalizedPrev = typeof prev === 'string' ? prev.trim() || null : prev;
    const normalizedNext = typeof next === 'string' ? next.trim() || null : next;
    if (Object.is(normalizedPrev, normalizedNext)) continue;
    if (
      typeof normalizedPrev === 'number' &&
      typeof normalizedNext === 'number' &&
      Math.abs(normalizedPrev - normalizedNext) < 0.001
    ) {
      continue;
    }
    fields.push(key);
    changes[key] = { from: normalizedPrev, to: normalizedNext };
  }
  return { fields, changes };
}

/** % OFF derivado solo de price + original_price (nunca se persiste). */
export function deriveOfferEditDiscountPercent(
  price: number | null | undefined,
  originalPrice: number | null | undefined
): number {
  const p = Number(price ?? 0);
  const o = Number(originalPrice ?? 0);
  if (!Number.isFinite(p) || !Number.isFinite(o) || o <= 0 || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}
