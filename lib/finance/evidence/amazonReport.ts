/**
 * Evidence Capture — Amazon Associates MX (Orders / Earnings reports).
 * docs/SYSTEMS/SYSTEM_payout_operations.md §9 (V2)
 *
 * Hechos (RESEARCH_affiliate_economic_intelligence):
 * - No hay API de comisiones; los reportes se descargan a mano (CSV/XLSX→CSV).
 * - Los reportes NO traen order id estable. Por eso el id externo es una huella
 *   determinista de la fila (report type + tracking + ASIN + fecha + qty + montos + n-ésima
 *   repetición). Es idempotente para el mismo reporte; se documenta como "fingerprint",
 *   no como id de Amazon.
 * - Earnings = enviado y pagado (comisión confirmada). Orders = pedido (aún no comisión).
 */

import { createHash } from 'node:crypto';
import {
  normHeader,
  normalizeAmountNumber,
  splitCsvLine,
} from '@/lib/commissions/parseAffiliateLedgerCsv';

export type AmazonReportType = 'earnings' | 'orders';

export type AmazonEvidenceRow = {
  line: number;
  kind: 'shipped_earning' | 'ordered' | 'return';
  asin: string | null;
  name: string | null;
  trackingId: string | null;
  /** ISO date (UTC midnight) */
  occurredAt: string;
  quantity: number;
  priceCents: number | null;
  revenueCents: number | null;
  /** Comisión (Ad Fees / Comisiones) — solo earnings. Negativo en devoluciones. */
  feesCents: number | null;
  returns: number;
  externalId: string;
};

export type AmazonReportParseResult = {
  type: AmazonReportType | null;
  rows: AmazonEvidenceRow[];
  skipped: number;
  warnings: string[];
  headers: string[];
  error?: string;
};

const COLS = {
  asin: ['asin'],
  name: ['name', 'nombre', 'product', 'producto', 'title', 'titulo'],
  tracking: ['tracking_id', 'tracking id', 'id_de_seguimiento', 'id de seguimiento', 'tag', 'tracking'],
  dateShipped: ['date_shipped', 'date shipped', 'fecha_de_envio', 'fecha de envío', 'fecha_envio', 'shipped_date'],
  date: ['date', 'fecha', 'order_date', 'fecha_de_pedido', 'fecha de pedido'],
  qty: ['qty', 'quantity', 'cantidad', 'items', 'articulos', 'artículos'],
  itemsShipped: ['items_shipped', 'items shipped', 'articulos_enviados', 'artículos enviados', 'enviados'],
  returns: ['returns', 'devoluciones', 'returned'],
  price: ['price', 'price($)', 'precio', 'precio($)', 'price_($)', 'precio_(mxn)'],
  revenue: ['revenue', 'revenue($)', 'ingresos', 'ingresos($)', 'revenue_($)', 'ventas', 'sales'],
  fees: [
    'ad_fees',
    'ad fees',
    'ad_fees($)',
    'ad fees($)',
    'advertising_fees',
    'comisiones',
    'comision',
    'comisión',
    'tarifas_de_publicidad',
    'tarifas de publicidad',
    'tarifas_publicitarias',
    'earnings',
    'ganancias',
    'commission',
    'commission_income',
  ],
};

function pick(headers: string[], aliases: string[]): number {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const n = normHeader(h).replace(/[()$]/g, '').replace(/_+$/g, '');
    if (!map.has(n)) map.set(n, i);
  });
  for (const a of aliases) {
    const n = normHeader(a).replace(/[()$]/g, '').replace(/_+$/g, '');
    const i = map.get(n);
    if (i != null) return i;
  }
  return -1;
}

export function detectAmazonReportType(headers: string[]): AmazonReportType | null {
  const hasFees = pick(headers, COLS.fees) >= 0;
  const hasShipped = pick(headers, COLS.dateShipped) >= 0 || pick(headers, COLS.itemsShipped) >= 0;
  if (hasFees || hasShipped) return 'earnings';
  const hasQty = pick(headers, COLS.qty) >= 0;
  const hasDate = pick(headers, COLS.date) >= 0;
  const hasAsin = pick(headers, COLS.asin) >= 0;
  if (hasAsin && (hasQty || hasDate)) return 'orders';
  return null;
}

const ES_MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11,
};

function utcIso(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m, d));
  if (dt.getUTCMonth() !== m) return null;
  return dt.toISOString();
}

/**
 * Fecha tolerante: ISO, "September 15, 2026", "15 de septiembre de 2026", "15/09/2026", "09/15/2026".
 * Devuelve { iso, ambiguous } — ambiguous cuando dd/mm vs mm/dd no se puede decidir.
 */
export function parseAmazonReportDate(raw: string): { iso: string | null; ambiguous: boolean } {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return { iso: null, ambiguous: false };

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { iso: utcIso(+iso[1], +iso[2] - 1, +iso[3]), ambiguous: false };

  const es = s
    .toLowerCase()
    .match(/^(\d{1,2})\s*(?:de\s*)?([a-záéíóú]+)\.?\s*(?:de\s*)?(\d{4})$/);
  if (es && ES_MONTHS[es[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')] != null) {
    const m = ES_MONTHS[es[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    return { iso: utcIso(+es[3], m, +es[1]), ambiguous: false };
  }

  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slash) {
    const a = +slash[1];
    const b = +slash[2];
    const y = +slash[3];
    if (a > 12 && b <= 12) return { iso: utcIso(y, b - 1, a), ambiguous: false };
    if (b > 12 && a <= 12) return { iso: utcIso(y, a - 1, b), ambiguous: false };
    // Ambiguo: Amazon Associates exporta mm/dd/yyyy por defecto.
    return { iso: utcIso(y, a - 1, b), ambiguous: a !== b };
  }

  const t = Date.parse(s);
  if (Number.isFinite(t)) {
    const d = new Date(t);
    return { iso: utcIso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), ambiguous: false };
  }
  return { iso: null, ambiguous: false };
}

function cents(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = normalizeAmountNumber(raw.replace(/[()]/g, (m) => (m === '(' ? '-' : '')));
  if (n == null) return null;
  return Math.round(n * 100);
}

function intOf(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function amazonEvidenceFingerprint(parts: {
  type: AmazonReportType;
  trackingId: string | null;
  asin: string | null;
  occurredAt: string;
  quantity: number;
  revenueCents: number | null;
  feesCents: number | null;
  occurrence: number;
}): string {
  const key = [
    parts.type,
    (parts.trackingId ?? '').toLowerCase(),
    (parts.asin ?? '').toUpperCase(),
    parts.occurredAt.slice(0, 10),
    parts.quantity,
    parts.revenueCents ?? '',
    parts.feesCents ?? '',
    parts.occurrence,
  ].join('|');
  const h = createHash('sha256').update(key).digest('hex').slice(0, 24);
  return `amz-rep:${parts.type}:${h}`;
}

export function parseAmazonAssociatesReport(csvText: string): AmazonReportParseResult {
  const text = csvText.replace(/^\uFEFF/, '').trim();
  const warnings: string[] = [];
  if (!text) return { type: null, rows: [], skipped: 0, warnings, headers: [], error: 'CSV vacío' };

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  // Amazon a veces antepone líneas de título antes del header real.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const cols = splitCsvLine(lines[i]);
    if (detectAmazonReportType(cols)) {
      headerIdx = i;
      break;
    }
  }
  const headers = splitCsvLine(lines[headerIdx]);
  const type = detectAmazonReportType(headers);
  if (!type) {
    return {
      type: null,
      rows: [],
      skipped: 0,
      warnings,
      headers,
      error:
        'No se reconoce el reporte. Se esperan columnas de Amazon Associates (ASIN, Tracking ID, Date Shipped/Fecha, Ad Fees/Comisiones o Qty).',
    };
  }
  if (lines.length <= headerIdx + 1) {
    return { type, rows: [], skipped: 0, warnings, headers, error: 'Reporte sin filas de datos' };
  }

  const iAsin = pick(headers, COLS.asin);
  const iName = pick(headers, COLS.name);
  const iTracking = pick(headers, COLS.tracking);
  const iDate = type === 'earnings' ? pick(headers, COLS.dateShipped) : -1;
  const iDateAny = iDate >= 0 ? iDate : pick(headers, COLS.date);
  const iQty = type === 'earnings' ? pick(headers, COLS.itemsShipped) : pick(headers, COLS.qty);
  const iQtyAny = iQty >= 0 ? iQty : pick(headers, COLS.qty);
  const iReturns = pick(headers, COLS.returns);
  const iPrice = pick(headers, COLS.price);
  const iRevenue = pick(headers, COLS.revenue);
  const iFees = pick(headers, COLS.fees);

  if (type === 'earnings' && iFees < 0) {
    warnings.push('Reporte earnings sin columna de comisión (Ad Fees / Comisiones): no se crearán comisiones.');
  }
  if (iTracking < 0) warnings.push('Sin columna Tracking ID: nada será atribuible a un creador.');
  if (iDateAny < 0) warnings.push('Sin columna de fecha: se usará la fecha de importación.');

  const rows: AmazonEvidenceRow[] = [];
  const occurrences = new Map<string, number>();
  let skipped = 0;
  let ambiguousDates = 0;

  for (let li = headerIdx + 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]);
    if (cols.every((c) => !c)) continue;
    const asin = iAsin >= 0 ? (cols[iAsin] ?? '').trim().toUpperCase() || null : null;
    if (!asin) {
      // Totales / pies de reporte
      skipped++;
      continue;
    }
    const trackingId = iTracking >= 0 ? (cols[iTracking] ?? '').trim() || null : null;
    const name = iName >= 0 ? (cols[iName] ?? '').trim() || null : null;

    let occurredAt = new Date().toISOString();
    if (iDateAny >= 0) {
      const d = parseAmazonReportDate(cols[iDateAny] ?? '');
      if (d.iso) occurredAt = d.iso;
      else {
        skipped++;
        warnings.push(`Línea ${li + 1}: fecha ilegible "${cols[iDateAny]}".`);
        continue;
      }
      if (d.ambiguous) ambiguousDates++;
    }

    const quantity = Math.max(0, iQtyAny >= 0 ? intOf(cols[iQtyAny]) : 1) || 0;
    const returns = iReturns >= 0 ? Math.max(0, intOf(cols[iReturns])) : 0;
    const priceCents = iPrice >= 0 ? cents(cols[iPrice]) : null;
    const revenueCents = iRevenue >= 0 ? cents(cols[iRevenue]) : null;
    const feesCents = type === 'earnings' && iFees >= 0 ? cents(cols[iFees]) : null;

    if (type === 'earnings' && feesCents == null && revenueCents == null) {
      skipped++;
      continue;
    }

    let kind: AmazonEvidenceRow['kind'] = type === 'earnings' ? 'shipped_earning' : 'ordered';
    if (type === 'earnings' && ((feesCents ?? 0) < 0 || (quantity === 0 && returns > 0))) {
      kind = 'return';
    }

    const keyBase = [type, trackingId ?? '', asin, occurredAt.slice(0, 10), quantity, revenueCents ?? '', feesCents ?? ''].join('|');
    const occurrence = (occurrences.get(keyBase) ?? 0) + 1;
    occurrences.set(keyBase, occurrence);

    rows.push({
      line: li + 1,
      kind,
      asin,
      name,
      trackingId,
      occurredAt,
      quantity,
      priceCents,
      revenueCents,
      feesCents,
      returns,
      externalId: amazonEvidenceFingerprint({
        type,
        trackingId,
        asin,
        occurredAt,
        quantity,
        revenueCents,
        feesCents,
        occurrence,
      }),
    });
  }

  if (ambiguousDates > 0) {
    warnings.push(
      `${ambiguousDates} fecha(s) ambiguas dd/mm vs mm/dd: se asumió mm/dd/yyyy (formato Amazon Associates).`,
    );
  }

  return { type, rows, skipped, warnings, headers };
}

export function summarizeAmazonEvidence(rows: AmazonEvidenceRow[]) {
  let feesCents = 0;
  let negativeFeesCents = 0;
  let revenueCents = 0;
  let withTracking = 0;
  const trackingIds = new Set<string>();
  for (const r of rows) {
    if (r.feesCents != null) {
      if (r.feesCents >= 0) feesCents += r.feesCents;
      else negativeFeesCents += r.feesCents;
    }
    revenueCents += r.revenueCents ?? 0;
    if (r.trackingId) {
      withTracking += 1;
      trackingIds.add(r.trackingId.toLowerCase());
    }
  }
  return {
    rows: rows.length,
    feesCents,
    negativeFeesCents,
    revenueCents,
    withTracking,
    trackingIds: [...trackingIds],
    returns: rows.filter((r) => r.kind === 'return').length,
  };
}
