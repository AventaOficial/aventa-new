import {
  COMMISSION_DEFAULT_ALLOCATION_RULE,
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_PAYOUT_HOLD_DAYS,
  COMMISSION_REQUIRED_OFFERS,
  type CommissionAllocationRule,
} from '@/lib/commissions/constants';

export {
  COMMISSION_DEFAULT_ALLOCATION_RULE,
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_PAYOUT_HOLD_DAYS,
  COMMISSION_REQUIRED_OFFERS,
};
export type { CommissionAllocationRule };

export type PeriodRange = {
  periodKey: string;
  startDate: string;
  endDate: string;
  startIso: string;
  nextStartIso: string;
};

export function parsePeriodKey(periodKey: string): PeriodRange | null {
  const trimmed = periodKey.trim();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const next = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  return {
    periodKey: trimmed,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    nextStartIso: next.toISOString(),
  };
}

/** Fecha ISO (UTC) a partir de la cual se puede liquidar tras el hold. */
export function payoutHoldReleaseIso(period: PeriodRange, holdDays = COMMISSION_PAYOUT_HOLD_DAYS): string {
  const end = new Date(`${period.endDate}T23:59:59.000Z`);
  end.setUTCDate(end.getUTCDate() + holdDays);
  return end.toISOString();
}

export type UserPoints = { userId: string; points: number };
export type UserAllocation = {
  userId: string;
  points: number;
  amountCents: number;
  attributedCents?: number;
  belowMinimum?: boolean;
};

/**
 * Distribuye totalCents proporcional a puntos (entero), con residuo por mayor fracción.
 * Orden estable para desempate por userId. (Legacy / puente.)
 */
export function allocateByPoints(totalCents: number, pointsRows: UserPoints[]): UserAllocation[] {
  const rows = pointsRows
    .filter((r) => Number.isFinite(r.points) && r.points > 0)
    .sort((a, b) => a.userId.localeCompare(b.userId));
  if (totalCents <= 0 || rows.length === 0) return [];
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  if (totalPoints <= 0) return [];

  const base = rows.map((r) => {
    const raw = (totalCents * r.points) / totalPoints;
    const floor = Math.floor(raw);
    return {
      userId: r.userId,
      points: r.points,
      floor,
      frac: raw - floor,
    };
  });
  let used = base.reduce((sum, r) => sum + r.floor, 0);
  let remainder = totalCents - used;

  const byFrac = [...base].sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    return a.userId.localeCompare(b.userId);
  });
  let i = 0;
  while (remainder > 0 && byFrac.length > 0) {
    byFrac[i % byFrac.length].floor += 1;
    remainder -= 1;
    i += 1;
  }

  return byFrac
    .map((r) => ({ userId: r.userId, points: r.points, amountCents: r.floor }))
    .sort((a, b) => b.amountCents - a.amountCents || a.userId.localeCompare(b.userId));
}

export type AttributedRevenueRow = { userId: string; attributedCents: number };

/**
 * Pago por aporte: cada creador recibe creatorShareBps de su comisión atribuida.
 * No reparte el pool “entre todos”: Ana con más ventas cobra más que Beto.
 */
export function allocateByAttributedRevenue(
  rows: AttributedRevenueRow[],
  creatorShareBps: number,
  options?: { minPayoutCents?: number; eligibleUserIds?: Set<string> },
): UserAllocation[] {
  const minPayout = options?.minPayoutCents ?? COMMISSION_MIN_PAYOUT_CENTS;
  const eligible = options?.eligibleUserIds;
  const bps = Math.max(0, Math.min(10000, Math.floor(creatorShareBps)));

  const byUser = new Map<string, number>();
  for (const row of rows) {
    if (!row.userId || !Number.isFinite(row.attributedCents) || row.attributedCents <= 0) continue;
    if (eligible && !eligible.has(row.userId)) continue;
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + Math.floor(row.attributedCents));
  }

  const out: UserAllocation[] = [];
  for (const [userId, attributedCents] of byUser) {
    const amountCents = Math.floor((attributedCents * bps) / 10000);
    if (amountCents <= 0) continue;
    out.push({
      userId,
      points: 0,
      amountCents,
      attributedCents,
      belowMinimum: amountCents < minPayout,
    });
  }

  return out.sort(
    (a, b) => b.amountCents - a.amountCents || a.userId.localeCompare(b.userId),
  );
}

export function isCommissionAllocationRule(value: unknown): value is CommissionAllocationRule {
  return value === 'attributed_revenue' || value === 'points_per_qualifying_offer';
}
