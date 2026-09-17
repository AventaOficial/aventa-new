/**
 * Display helpers for MSI — never invent months.
 * Valid range mirrors DB CHECK offers.msi_months 1–24.
 */

export const MSI_MONTHS_MIN = 1;
export const MSI_MONTHS_MAX = 24;

export function isValidMsiMonths(raw: unknown): raw is number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
  const n = Math.trunc(raw);
  return n >= MSI_MONTHS_MIN && n <= MSI_MONTHS_MAX && n === raw;
}

/** Normalize API/UI input: null clear, integer 1–24, else invalid. */
export function parseOfferEditMsiMonths(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  const n =
    typeof raw === 'number' ? raw : Number(String(raw).trim().replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    return { ok: false, error: 'MSI debe ser un número entero o vacío' };
  }
  const truncated = Math.trunc(n);
  if (truncated !== n) {
    return { ok: false, error: 'MSI debe ser un entero (sin decimales)' };
  }
  if (truncated < MSI_MONTHS_MIN || truncated > MSI_MONTHS_MAX) {
    return {
      ok: false,
      error: `MSI debe estar entre ${MSI_MONTHS_MIN} y ${MSI_MONTHS_MAX}`,
    };
  }
  return { ok: true, value: truncated };
}

/** Compact badge for feed cards. Null if invalid/absent. */
export function formatMsiCardLabel(msiMonths: unknown): string | null {
  if (!isValidMsiMonths(msiMonths)) return null;
  return `Hasta ${msiMonths} MSI`;
}
