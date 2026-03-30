import {
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_REQUIRED_OFFERS,
} from '@/lib/commissions/constants';

export const COMMISSION_DEFAULT_CREATOR_SHARE_BPS = 3000;

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

export type UserPoints = { userId: string; points: number };
export type UserAllocation = { userId: string; points: number; amountCents: number };

/**
 * Distribuye totalCents proporcional a puntos (entero), con residuo por mayor fracción.
 * Orden estable para desempate por userId.
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

export { COMMISSION_MIN_UPVOTES_PER_OFFER, COMMISSION_REQUIRED_OFFERS };
