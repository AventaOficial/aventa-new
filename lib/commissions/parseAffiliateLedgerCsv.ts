/**
 * Parseo de filas CSV de reportes afiliados → ledger entries.
 * Formato flexible: header con columnas reconocidas (case-insensitive).
 *
 * Columnas soportadas (aliases):
 * - amount / amount_cents / commission / comisión / earnings
 * - tag / tracking_tag / subtag / tracking id / associate tag
 * - network / store (opcional; default del body)
 * - external_ref / id / order_id / transaction
 * - currency (default MXN)
 */

import type { AffiliateLedgerNetwork } from '@/lib/commissions/affiliateLedger';

export type AmountUnit = 'major' | 'cents';

export type ParsedLedgerCsvRow = {
  amount_cents: number;
  tracking_tag: string | null;
  external_ref: string | null;
  currency: string;
  network?: AffiliateLedgerNetwork;
  notes?: string;
  raw_line: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function pickCol(headers: string[], aliases: string[]): number {
  const set = new Map(headers.map((h, i) => [normHeader(h), i]));
  for (const a of aliases) {
    const i = set.get(normHeader(a));
    if (i != null) return i;
  }
  return -1;
}

/** Normaliza 1.234,56 / 1,234.56 / 12.50 a un número JS. */
export function normalizeAmountNumber(raw: string): number | null {
  let s = raw.trim().replace(/[$€\s]/g, '').replace(/mxn/gi, '');
  if (!s || !/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    s = after <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    if (after === 3 && /^\d+$/.test(s.replace(/\./g, ''))) {
      s = s.replace(/\./g, '');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convierte un monto CSV a centavos.
 * `major` = pesos/unidades (12.50 → 1250). `cents` = ya son centavos (1250 → 1250).
 * Nunca adivina la unidad por magnitud.
 */
export function parseAmountToCents(raw: string, unit: AmountUnit): number | null {
  const n = normalizeAmountNumber(raw);
  if (n == null) return null;
  if (unit === 'cents') {
    if (!Number.isInteger(n)) return null;
    return n;
  }
  return Math.round(n * 100);
}

const NETWORK_MAP: Record<string, AffiliateLedgerNetwork> = {
  amazon: 'amazon',
  amz: 'amazon',
  mercadolibre: 'mercadolibre',
  ml: 'mercadolibre',
  'mercado_libre': 'mercadolibre',
  aliexpress: 'aliexpress',
  temu: 'temu',
  walmart: 'walmart',
  shein: 'shein',
  other: 'other',
};

/**
 * Parsea CSV completo. Primera fila = headers.
 * Filas sin monto válido se omiten (van a `skipped`).
 */
export function parseAffiliateLedgerCsv(
  csvText: string,
  defaults?: { network?: AffiliateLedgerNetwork; currency?: string; amountUnit?: AmountUnit },
): { rows: ParsedLedgerCsvRow[]; skipped: number; error?: string } {
  const text = csvText.replace(/^\uFEFF/, '').trim();
  if (!text) return { rows: [], skipped: 0, error: 'CSV vacío' };

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0, error: 'CSV sin datos (solo header o vacío)' };

  const headers = splitCsvLine(lines[0]);
  const iAmountCents = pickCol(headers, ['amount_cents']);
  const iAmount = iAmountCents >= 0
    ? iAmountCents
    : pickCol(headers, [
        'amount',
        'commission',
        'comision',
        'earnings',
        'earning',
        'revenue',
        'neto',
        'total',
      ]);
  const amountUnit: AmountUnit =
    defaults?.amountUnit ?? (iAmountCents >= 0 ? 'cents' : 'major');
  if (iAmount < 0) {
    return {
      rows: [],
      skipped: 0,
      error: 'Falta columna de monto (amount, commission, earnings, …)',
    };
  }

  const iTag = pickCol(headers, [
    'tracking_tag',
    'tag',
    'subtag',
    'sub_tag',
    'tracking_id',
    'tracking',
    'associate_tag',
    'affiliate_tag',
    'ascsubtag',
    'sub_id',
  ]);
  const iRef = pickCol(headers, [
    'external_ref',
    'id',
    'order_id',
    'transaction',
    'transaction_id',
    'asin',
    'ref',
  ]);
  const iCurrency = pickCol(headers, ['currency', 'moneda']);
  const iNetwork = pickCol(headers, ['network', 'store', 'red', 'merchant']);

  const rows: ParsedLedgerCsvRow[] = [];
  let skipped = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]);
    const amountCents = parseAmountToCents(cols[iAmount] ?? '', amountUnit);
    if (amountCents == null || amountCents === 0) {
      skipped++;
      continue;
    }

    const tagRaw = iTag >= 0 ? (cols[iTag] ?? '').trim() : '';
    const refRaw = iRef >= 0 ? (cols[iRef] ?? '').trim() : '';
    const currency =
      (iCurrency >= 0 ? (cols[iCurrency] ?? '').trim().toUpperCase() : '') ||
      defaults?.currency ||
      'MXN';

    let network = defaults?.network;
    if (iNetwork >= 0) {
      const n = normHeader(cols[iNetwork] ?? '');
      if (NETWORK_MAP[n]) network = NETWORK_MAP[n];
    }

    rows.push({
      amount_cents: amountCents,
      tracking_tag: tagRaw || null,
      external_ref: refRaw || null,
      currency: currency.slice(0, 3) || 'MXN',
      network,
      notes: `csv_line:${li + 1}`,
      raw_line: lines[li],
    });
  }

  return { rows, skipped };
}
