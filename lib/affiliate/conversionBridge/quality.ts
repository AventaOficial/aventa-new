/** Hallazgos de calidad. Una fila rechazada queda en el lote; no se tira en silencio. */

export const QUALITY_CODES = [
  'DUPLICATE_EXTERNAL_ID',
  'MISSING_EXTERNAL_ID',
  'INVALID_COMMISSION',
  'UNKNOWN_CURRENCY',
  'IMPOSSIBLE_TIMESTAMP',
  'REVERSED_WITHOUT_ORIGINAL',
  'CONFIRMED_WITHOUT_EVIDENCE',
  'UNMATCHED_CONVERSION',
  'COMMISSION_WITHOUT_CONVERSION',
  'CONVERSION_WITHOUT_CLICK',
  'PROVIDER_STATUS_UNKNOWN',
  'DUPLICATE_ORDER',
  'PII_OR_CREDENTIAL_MATERIAL',
] as const;

export type QualityCode = (typeof QUALITY_CODES)[number];

const CURRENCIES = new Set(['MXN', 'USD', 'ARS', 'BRL', 'CLP', 'COP', 'PEN', 'UYU']);

const PII_OR_SECRET =
  /\b(email|e-mail|telefono|teléfono|comprador|buyer|dni|rfc|direccion|dirección|password|secret|token|authorization|api_key)\b/i;

export function knownCurrency(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!CURRENCIES.has(value)) return null;
  return value;
}

/** Importes en unidades mayores con hasta 2 decimales. Sin separador de miles. */
export function majorToCents(raw: string | null | undefined): number | null {
  const value = (raw ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function timestampIssue(raw: string, nowMs: number): 'IMPOSSIBLE_TIMESTAMP' | null {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return 'IMPOSSIBLE_TIMESTAMP';
  if (ms < Date.parse('2010-01-01T00:00:00.000Z')) return 'IMPOSSIBLE_TIMESTAMP';
  if (ms > nowMs + 24 * 3600_000) return 'IMPOSSIBLE_TIMESTAMP';
  return null;
}

export function containsSensitiveMaterial(raw: string): boolean {
  return PII_OR_SECRET.test(raw);
}
