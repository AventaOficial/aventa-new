/**
 * CazaOfertasss — FASE 4.1. Parsers seguros JSON / CSV → ítems crudos.
 *
 * Sólo forma: convierten texto en `unknown[]` acotado. La validación de
 * negocio ocurre después (contract + validators del dominio). Sin eval, sin
 * prototipos, sin filas ilimitadas.
 */

import {
  MANUAL_IMPORT_MAX_BYTES,
  MANUAL_IMPORT_MAX_CELL_LENGTH,
  MANUAL_IMPORT_MAX_ITEMS,
} from '../constants';
import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';

export interface ManualImportParseOptions {
  /** Máximo de ítems aceptados; más ⇒ rechazo completo. */
  readonly maxItems?: number;
  readonly maxBytes?: number;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function boundedMax(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) return MANUAL_IMPORT_MAX_ITEMS;
  return Math.min(Math.floor(value), MANUAL_IMPORT_MAX_ITEMS);
}

const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripDangerousKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDangerousKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PROTO_KEYS.has(k)) continue;
      out[k] = stripDangerousKeys(v);
    }
    return out;
  }
  return value;
}

/** JSON: array de ítems o `{ items: [...] }`. */
export function parseManualDealImportJson(
  text: string,
  options: ManualImportParseOptions = {}
): CazaResult<readonly unknown[]> {
  const maxBytes = options.maxBytes ?? MANUAL_IMPORT_MAX_BYTES;
  const maxItems = boundedMax(options.maxItems);
  if (typeof text !== 'string') return failResult(['manual_import.body_not_string']);
  if (byteLength(text) > maxBytes) return failResult(['manual_import.body_too_large']);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return failResult(['manual_import.json_invalid']);
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
      ? ((parsed as { items: unknown[] }).items)
      : null;
  if (items === null) return failResult(['manual_import.json_shape_invalid']);
  if (items.length > maxItems) {
    return failResult([`manual_import.limit_exceeded:${items.length}>${maxItems}`]);
  }
  return okResult(items.map(stripDangerousKeys));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Columnas snake_case aceptadas → campo del ítem. */
const CSV_COLUMNS: Readonly<Record<string, string>> = {
  source: 'source',
  store: 'store',
  external_product_id: 'externalProductId',
  canonical_url: 'canonicalUrl',
  title: 'title',
  current_price: 'currentPrice',
  reference_price: 'referencePrice',
  currency: 'currency',
  captured_at: 'capturedAt',
  category: 'category',
  availability: 'availability',
  affiliate_mapping_ref: 'affiliateMappingRef',
  evidence_source: 'evidence.source',
  evidence_quality: 'evidence.evidenceQuality',
  price_confidence: 'evidence.priceConfidence',
  historical_confidence: 'evidence.historicalConfidence',
  observation_window_days: 'evidence.observationWindowDays',
  observation_count: 'evidence.observationCount',
  coupon_applied: 'evidence.couponApplied',
  promotion_applied: 'evidence.promotionApplied',
  evidence_notes: 'evidence.notes',
  seller_external_id: 'seller.externalSellerId',
  seller_display_name: 'seller.displayName',
  seller_trust_class: 'seller.trustClass',
  seller_reputation_score: 'seller.reputationScore',
};

const REQUIRED_CSV_COLUMNS = ['store', 'canonical_url', 'title', 'current_price', 'currency', 'captured_at'];

const INT_FIELDS = new Set(['evidence.observationWindowDays', 'evidence.observationCount']);
const BOOL_FIELDS = new Set(['evidence.couponApplied', 'evidence.promotionApplied']);
const FLOAT_FIELDS = new Set(['seller.reputationScore']);

/** Tokenizador RFC4180 mínimo (comillas, comas, saltos de línea embebidos). */
function tokenizeCsv(text: string, maxRows: number): CazaResult<string[][]> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^\uFEFF/, '');

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      if (cell.length > MANUAL_IMPORT_MAX_CELL_LENGTH) return failResult(['manual_import.csv_cell_too_long']);
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      i += 1;
      if (rows.length > maxRows) return failResult([`manual_import.limit_exceeded:>${maxRows - 1}`]);
      continue;
    }
    cell += ch;
    i += 1;
    if (cell.length > MANUAL_IMPORT_MAX_CELL_LENGTH) return failResult(['manual_import.csv_cell_too_long']);
  }
  if (inQuotes) return failResult(['manual_import.csv_unterminated_quote']);
  row.push(cell);
  if (row.some((c) => c.length > 0)) rows.push(row);
  if (rows.length > maxRows) return failResult([`manual_import.limit_exceeded:>${maxRows - 1}`]);
  return okResult(rows);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const [head, tail] = path.split('.', 2);
  if (!tail) {
    target[head] = value;
    return;
  }
  const nested = (target[head] as Record<string, unknown> | undefined) ?? {};
  nested[tail] = value;
  target[head] = nested;
}

function coerceCell(field: string, raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (INT_FIELDS.has(field)) {
    return /^-?\d{1,9}$/.test(value) ? Number(value) : `invalid_int:${value.slice(0, 16)}`;
  }
  if (FLOAT_FIELDS.has(field)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : `invalid_number:${value.slice(0, 16)}`;
  }
  if (BOOL_FIELDS.has(field)) {
    const lowered = value.toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(lowered)) return true;
    if (['false', '0', 'no'].includes(lowered)) return false;
    return `invalid_bool:${value.slice(0, 16)}`;
  }
  return value;
}

/**
 * CSV con header obligatorio. Filas → ítems crudos (los precios se mantienen
 * como string: la autoridad de precio es `price.ts`).
 */
export function parseManualDealImportCsv(
  text: string,
  options: ManualImportParseOptions = {}
): CazaResult<readonly unknown[]> {
  const maxBytes = options.maxBytes ?? MANUAL_IMPORT_MAX_BYTES;
  const maxItems = boundedMax(options.maxItems);
  if (typeof text !== 'string') return failResult(['manual_import.body_not_string']);
  if (byteLength(text) > maxBytes) return failResult(['manual_import.body_too_large']);

  const tokenized = tokenizeCsv(text, maxItems + 1);
  if (!tokenized.ok) return tokenized;
  const [header, ...dataRows] = tokenized.value;
  if (!header || header.length === 0) return failResult(['manual_import.csv_header_missing']);

  const columns = header.map((h) => h.trim().toLowerCase());
  const unknownColumns = columns.filter((c) => !(c in CSV_COLUMNS));
  if (unknownColumns.length > 0) {
    return failResult([`manual_import.csv_unknown_columns:${unknownColumns.slice(0, 5).join('|')}`]);
  }
  const missing = REQUIRED_CSV_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length > 0) {
    return failResult([`manual_import.csv_missing_columns:${missing.join('|')}`]);
  }
  if (dataRows.length > maxItems) {
    return failResult([`manual_import.limit_exceeded:${dataRows.length}>${maxItems}`]);
  }

  const items: unknown[] = [];
  for (const cells of dataRows) {
    const item: Record<string, unknown> = {};
    columns.forEach((column, idx) => {
      const field = CSV_COLUMNS[column];
      const raw = cells[idx] ?? '';
      setPath(item, field, coerceCell(field, raw));
    });
    // Evidencia mínima: si no hay ninguna columna evidence_* el objeto queda ausente
    // y el contrato lo rechaza (fail-closed).
    items.push(item);
  }
  return okResult(items);
}
