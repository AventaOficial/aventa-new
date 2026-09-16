/**
 * Shared validators for normalized monetary fields.
 * Network is authority — Aventa never computes sale×%.
 */

const CURRENCY_RE = /^[A-Z]{3}$/;

export function isValidCurrencyCode(raw: string | null | undefined): boolean {
  return Boolean(raw && CURRENCY_RE.test(raw.trim().toUpperCase()));
}

export function normalizeCurrency(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  return isValidCurrencyCode(c) ? c : null;
}

export function isNonNegativeIntegerCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && Number.isFinite(n);
}

export function isIntegerCents(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n);
}

/** Bound raw evidence size to avoid storing unbounded payloads. */
export function boundRawReference(
  raw: Record<string, unknown> | undefined,
  maxKeys = 40,
): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  let i = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (i >= maxKeys) break;
    if (typeof v === 'string' && v.length > 2000) {
      out[k] = `${v.slice(0, 2000)}…`;
    } else if (v !== undefined) {
      out[k] = v;
    }
    i += 1;
  }
  return out;
}
