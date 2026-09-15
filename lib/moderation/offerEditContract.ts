/**
 * Contrato puro de edición de oferta en moderación.
 * No inventa columnas; valida solo campos del schema real.
 */

export type OfferEditSnapshot = {
  title?: string | null;
  price?: number | null;
  original_price?: number | null;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  offer_url?: string | null;
  coupons?: string | null;
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

export function sanitizeOfferEditCoupons(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
  return t.length > 0 ? t : null;
}

/** Cambios que afectan identidad comercial / evidencia de una oferta live. */
export function isMaterialOfferEdit(fields: ReadonlyArray<string>): boolean {
  return fields.some((f) =>
    f === 'price' || f === 'original_price' || f === 'offer_url' || f === 'image_url'
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
    const normalizedPrev =
      typeof prev === 'string' ? prev.trim() || null : prev;
    const normalizedNext =
      typeof next === 'string' ? next.trim() || null : next;
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
