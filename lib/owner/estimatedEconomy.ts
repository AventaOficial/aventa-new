import { createServerClient } from '@/lib/supabase/server';
import {
  classifyFinancialRecord,
  isProductionFinancialRecord,
  moneyProvenanceLabel,
  type MoneyProvenanceKind,
  type FinancialRecordSignals,
} from '@/lib/finance/financialRecordClass';
import {
  daysAgoUtc,
  getYmdInTz,
  monthYmdRange,
  windowLastDays,
  windowToday,
} from '@/lib/owner/mxTime';

export type EconomyConfidence = 'alta' | 'media' | 'baja';

export type EpcStatus = 'READY' | 'NO_DATA';

export type EconomyPeriodSnapshot = {
  /** Revenue confirmado de producción (nunca QA). */
  realCents: number | null;
  /** Oportunidad estimada; null si no hay EPC productivo. */
  estimatedCents: number | null;
  outbound: number | null;
};

export type EstimatedEconomy = {
  epcCents: number | null;
  epcStatus: EpcStatus;
  epcWindowLabel: string;
  confidence: EconomyConfidence;
  confidenceReason: string;
  ledgerAvailable: boolean;
  /** Filas ledger productivas usadas en economía. */
  productionLedgerRows: number;
  /** Filas QA/synthetic excluidas. */
  syntheticLedgerRowsExcluded: number;
  confirmedProvenance: MoneyProvenanceKind;
  estimatedProvenance: MoneyProvenanceKind;
  day: EconomyPeriodSnapshot;
  week: EconomyPeriodSnapshot;
  month: EconomyPeriodSnapshot;
};

export type LedgerEconomyRow = {
  amount_cents: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  external_ref?: string | null;
  source?: string | null;
  notes?: string | null;
  meta?: unknown;
  tracking_tag?: string | null;
};

const EPC_MIN_OUTBOUND_ALTA = 50;
const EPC_MIN_OUTBOUND_COMPUTE = 1;

export function ledgerRowSignals(row: LedgerEconomyRow): FinancialRecordSignals {
  return {
    externalRef: row.external_ref,
    source: row.source,
    notes: row.notes,
    meta: row.meta,
    trackingTag: row.tracking_tag,
  };
}

/** Filtra solo filas PRODUCTION para métricas económicas. */
export function filterProductionLedgerRows(rows: LedgerEconomyRow[]): {
  production: LedgerEconomyRow[];
  syntheticExcluded: number;
  legacyUnverified: number;
} {
  const production: LedgerEconomyRow[] = [];
  let syntheticExcluded = 0;
  let legacyUnverified = 0;
  for (const row of rows) {
    const klass = classifyFinancialRecord(ledgerRowSignals(row));
    if (klass === 'PRODUCTION') production.push(row);
    else if (klass === 'SYNTHETIC_QA') syntheticExcluded += 1;
    else legacyUnverified += 1;
  }
  return { production, syntheticExcluded, legacyUnverified };
}

export function computeEpcCents(ledgerCents: number, outbound: number): number | null {
  if (outbound < EPC_MIN_OUTBOUND_COMPUTE || ledgerCents <= 0) return null;
  return Math.round(ledgerCents / outbound);
}

export function sumLedgerCentsInRange(
  rows: Array<Pick<LedgerEconomyRow, 'amount_cents' | 'period_start' | 'period_end' | 'created_at'>>,
  ymdStart: string,
  ymdEnd: string,
  startIso: string,
  endIso: string
): number {
  let sum = 0;
  for (const r of rows) {
    const ps = r.period_start;
    const pe = r.period_end;
    const inPeriod =
      (ps && ps <= ymdEnd && (!pe || pe >= ymdStart)) ||
      (!ps && r.created_at >= startIso && r.created_at < endIso);
    if (inPeriod) sum += Number(r.amount_cents) || 0;
  }
  return sum;
}

function estimatePeriodCents(outbound: number | null, epcCents: number | null): number | null {
  if (outbound == null || epcCents == null || outbound === 0) return null;
  return outbound * epcCents;
}

async function countOutboundBetween(start: string, end: string): Promise<number | null> {
  const supabase = createServerClient();
  const { count, error } = await supabase
    .from('offer_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'outbound')
    .gte('created_at', start)
    .lt('created_at', end);
  if (error) return null;
  return count ?? 0;
}

async function fetchLedgerRows(): Promise<{
  rows: LedgerEconomyRow[];
  available: boolean;
  note: string | null;
}> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .select(
      'amount_cents, period_start, period_end, status, created_at, external_ref, source, notes, meta, tracking_tag',
    )
    .in('status', ['accrued', 'paid', 'pending']);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    // Columnas nuevas pueden faltar en entornos viejos — fallback mínimo.
    if (msg.includes('column') || msg.includes('does not exist')) {
      const fallback = await supabase
        .from('affiliate_ledger_entries')
        .select('amount_cents, period_start, period_end, status, created_at, external_ref')
        .in('status', ['accrued', 'paid', 'pending']);
      if (fallback.error) {
        if ((fallback.error.message ?? '').toLowerCase().includes('affiliate_ledger')) {
          return { rows: [], available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
        }
        return { rows: [], available: false, note: fallback.error.message };
      }
      return { rows: (fallback.data ?? []) as LedgerEconomyRow[], available: true, note: null };
    }
    if (msg.includes('affiliate_ledger') || msg.includes('does not exist')) {
      return { rows: [], available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
    }
    return { rows: [], available: false, note: error.message };
  }
  return { rows: (data ?? []) as LedgerEconomyRow[], available: true, note: null };
}

type EpcWindow = {
  label: string;
  startIso: string;
  endIso: string;
  ymdStart: string;
  ymdEnd: string;
};

function buildEpcWindows(ref: Date): EpcWindow[] {
  const todayYmd = getYmdInTz(ref);
  const d90 = getYmdInTz(new Date(ref.getTime() - 90 * 24 * 60 * 60 * 1000));
  const d30 = getYmdInTz(new Date(ref.getTime() - 30 * 24 * 60 * 60 * 1000));
  const month = monthYmdRange(ref);
  return [
    {
      label: 'últimos 90 días',
      startIso: daysAgoUtc(90, ref),
      endIso: ref.toISOString(),
      ymdStart: d90,
      ymdEnd: todayYmd,
    },
    {
      label: 'últimos 30 días',
      startIso: daysAgoUtc(30, ref),
      endIso: ref.toISOString(),
      ymdStart: d30,
      ymdEnd: todayYmd,
    },
    {
      label: 'mes calendario actual',
      startIso: month.startIso,
      endIso: month.endIso,
      ymdStart: month.ymdStart,
      ymdEnd: month.ymdEnd,
    },
  ];
}

function resolveConfidence(
  ledgerAvailable: boolean,
  ledgerCentsW: number,
  outboundW: number,
  epcCents: number | null,
  syntheticExcluded: number,
): { confidence: EconomyConfidence; reason: string } {
  if (!ledgerAvailable) {
    return {
      confidence: 'baja',
      reason: 'Ledger de afiliados no disponible. Registra comisiones en Admin → Comisiones.',
    };
  }
  if (epcCents == null) {
    if (syntheticExcluded > 0 && ledgerCentsW <= 0) {
      return {
        confidence: 'baja',
        reason: `EPC = NO_DATA. ${syntheticExcluded} fila(s) QA/synthetic excluidas; sin ledger productivo.`,
      };
    }
    if (outboundW === 0) {
      return {
        confidence: 'baja',
        reason: 'Sin clics outbound en la ventana usada para calcular EPC.',
      };
    }
    if (ledgerCentsW <= 0) {
      return {
        confidence: 'baja',
        reason:
          'Sin movimientos productivos en ledger. Importa ingresos de red reales antes de estimar.',
      };
    }
    return { confidence: 'baja', reason: 'EPC = NO_DATA. No hay base productiva suficiente.' };
  }
  if (ledgerCentsW > 0 && outboundW >= EPC_MIN_OUTBOUND_ALTA) {
    return {
      confidence: 'alta',
      reason: `EPC calculado solo con ledger productivo (${outboundW} clics).`,
    };
  }
  return {
    confidence: 'media',
    reason:
      outboundW < EPC_MIN_OUTBOUND_ALTA
        ? `EPC productivo con muestra pequeña (${outboundW} clics).`
        : 'EPC productivo con histórico limitado.',
  };
}

export async function buildEstimatedEconomy(ref = new Date()): Promise<EstimatedEconomy> {
  const { rows: rawRows, available, note } = await fetchLedgerRows();
  const { production, syntheticExcluded } = filterProductionLedgerRows(
    available ? rawRows : [],
  );
  const rows = production;

  const todayW = windowToday(ref);
  const weekW = windowLastDays(7, ref);
  const monthW = monthYmdRange(ref);

  const [outToday, outWeek, outMonth] = await Promise.all([
    countOutboundBetween(todayW.start, todayW.end),
    countOutboundBetween(weekW.start, weekW.end),
    countOutboundBetween(monthW.startIso, monthW.endIso),
  ]);

  let epcCents: number | null = null;
  let epcWindowLabel = '—';
  let ledgerCentsW = 0;
  let outboundW = 0;

  if (available) {
    for (const w of buildEpcWindows(ref)) {
      const ledgerSum = sumLedgerCentsInRange(rows, w.ymdStart, w.ymdEnd, w.startIso, w.endIso);
      const outbound = await countOutboundBetween(w.startIso, w.endIso);
      const ob = outbound ?? 0;
      if (ledgerSum > 0 && ob >= EPC_MIN_OUTBOUND_COMPUTE) {
        epcCents = computeEpcCents(ledgerSum, ob);
        epcWindowLabel = w.label;
        ledgerCentsW = ledgerSum;
        outboundW = ob;
        break;
      }
      if (!epcCents && w.label === 'mes calendario actual') {
        ledgerCentsW = ledgerSum;
        outboundW = ob;
        epcWindowLabel = w.label;
      }
    }
  }

  const { confidence, reason } = resolveConfidence(
    available,
    ledgerCentsW,
    outboundW,
    epcCents,
    syntheticExcluded,
  );
  const confidenceReason = available ? reason : (note ?? reason);
  const epcStatus: EpcStatus = epcCents != null ? 'READY' : 'NO_DATA';

  const realMonthSum = available
    ? sumLedgerCentsInRange(rows, monthW.ymdStart, monthW.ymdEnd, monthW.startIso, monthW.endIso)
    : 0;
  const realWeekSum = available
    ? sumLedgerCentsInRange(
        rows,
        getYmdInTz(new Date(ref.getTime() - 7 * 24 * 60 * 60 * 1000)),
        getYmdInTz(ref),
        weekW.start,
        weekW.end,
      )
    : 0;
  const realDaySum = available
    ? sumLedgerCentsInRange(rows, getYmdInTz(ref), getYmdInTz(ref), todayW.start, todayW.end)
    : 0;

  const realCentsForPeriod = (sum: number): number | null => {
    if (!available) return null;
    return sum;
  };

  const confirmedProvenance: MoneyProvenanceKind =
    !available
      ? 'no_production_data'
      : syntheticExcluded > 0 && rows.length === 0
        ? 'synthetic_excluded'
        : realMonthSum > 0
          ? 'confirmed_production'
          : 'no_production_data';

  const estimatedProvenance: MoneyProvenanceKind =
    epcCents != null ? 'estimated_opportunity' : 'no_production_data';

  return {
    epcCents,
    epcStatus,
    epcWindowLabel,
    confidence,
    confidenceReason,
    ledgerAvailable: available,
    productionLedgerRows: rows.length,
    syntheticLedgerRowsExcluded: syntheticExcluded,
    confirmedProvenance,
    estimatedProvenance,
    day: {
      realCents: realCentsForPeriod(realDaySum),
      estimatedCents: estimatePeriodCents(outToday, epcCents),
      outbound: outToday,
    },
    week: {
      realCents: realCentsForPeriod(realWeekSum),
      estimatedCents: estimatePeriodCents(outWeek, epcCents),
      outbound: outWeek,
    },
    month: {
      realCents: realCentsForPeriod(realMonthSum),
      estimatedCents: estimatePeriodCents(outMonth, epcCents),
      outbound: outMonth,
    },
  };
}

export { moneyProvenanceLabel, isProductionFinancialRecord };
