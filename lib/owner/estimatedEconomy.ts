import { createServerClient } from '@/lib/supabase/server';
import {
  daysAgoUtc,
  getYmdInTz,
  monthYmdRange,
  windowLastDays,
  windowToday,
} from '@/lib/owner/mxTime';

export type EconomyConfidence = 'alta' | 'media' | 'baja';

export type EconomyPeriodSnapshot = {
  realCents: number | null;
  estimatedCents: number | null;
  outbound: number | null;
};

export type EstimatedEconomy = {
  epcCents: number | null;
  epcWindowLabel: string;
  confidence: EconomyConfidence;
  confidenceReason: string;
  ledgerAvailable: boolean;
  day: EconomyPeriodSnapshot;
  week: EconomyPeriodSnapshot;
  month: EconomyPeriodSnapshot;
};

type LedgerRow = {
  amount_cents: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

const EPC_MIN_OUTBOUND_ALTA = 50;
const EPC_MIN_OUTBOUND_COMPUTE = 1;

export function computeEpcCents(ledgerCents: number, outbound: number): number | null {
  if (outbound < EPC_MIN_OUTBOUND_COMPUTE || ledgerCents <= 0) return null;
  return Math.round(ledgerCents / outbound);
}

export function sumLedgerCentsInRange(
  rows: LedgerRow[],
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

async function fetchLedgerRows(): Promise<{ rows: LedgerRow[]; available: boolean; note: string | null }> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .select('amount_cents, period_start, period_end, status, created_at')
    .in('status', ['accrued', 'paid', 'pending']);

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('affiliate_ledger') || msg.includes('does not exist')) {
      return { rows: [], available: false, note: 'Tabla affiliate_ledger_entries no migrada' };
    }
    return { rows: [], available: false, note: error.message };
  }
  return { rows: (data ?? []) as LedgerRow[], available: true, note: null };
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
  epcCents: number | null
): { confidence: EconomyConfidence; reason: string } {
  if (!ledgerAvailable) {
    return {
      confidence: 'baja',
      reason: 'Ledger de afiliados no disponible. Registra comisiones en Admin → Comisiones.',
    };
  }
  if (epcCents == null) {
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
          'Sin movimientos en ledger en la ventana de EPC. Importa ingresos de red antes de estimar.',
      };
    }
    return { confidence: 'baja', reason: 'No hay base suficiente para calcular EPC.' };
  }
  if (ledgerCentsW > 0 && outboundW >= EPC_MIN_OUTBOUND_ALTA) {
    return {
      confidence: 'alta',
      reason: `EPC calculado con ${outboundW} clics y comisiones registradas en ledger.`,
    };
  }
  return {
    confidence: 'media',
    reason:
      outboundW < EPC_MIN_OUTBOUND_ALTA
        ? `EPC con muestra pequeña (${outboundW} clics). Actualiza ledger con frecuencia.`
        : 'EPC disponible con histórico limitado en ledger.',
  };
}

export async function buildEstimatedEconomy(ref = new Date()): Promise<EstimatedEconomy> {
  const { rows, available, note } = await fetchLedgerRows();

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

  const { confidence, reason } = resolveConfidence(available, ledgerCentsW, outboundW, epcCents);
  const confidenceReason = available ? reason : (note ?? reason);

  const realMonthSum = available
    ? sumLedgerCentsInRange(rows, monthW.ymdStart, monthW.ymdEnd, monthW.startIso, monthW.endIso)
    : 0;
  const realWeekSum = available
    ? sumLedgerCentsInRange(
        rows,
        getYmdInTz(new Date(ref.getTime() - 7 * 24 * 60 * 60 * 1000)),
        getYmdInTz(ref),
        weekW.start,
        weekW.end
      )
    : 0;
  const realDaySum = available
    ? sumLedgerCentsInRange(rows, getYmdInTz(ref), getYmdInTz(ref), todayW.start, todayW.end)
    : 0;

  const realCentsForPeriod = (sum: number): number | null => {
    if (!available) return null;
    return sum;
  };

  return {
    epcCents,
    epcWindowLabel,
    confidence,
    confidenceReason,
    ledgerAvailable: available,
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
