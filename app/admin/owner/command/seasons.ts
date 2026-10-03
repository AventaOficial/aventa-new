import { addCalendarDays, isBlackFridayWindow, isSeasonWindow } from '@/lib/achievements/calendar';

export type SeasonWindow = {
  id: string;
  name: string;
  start: string;
  end: string;
  daysUntil: number;
  active: boolean;
};

function seasonName(start: string, blackFriday: boolean): string {
  if (blackFriday) return 'Black Friday → Cyber Monday';
  const md = start.slice(5);
  if (md >= '05-01' && md <= '05-31') return 'Hot Sale';
  if (md >= '11-01' && md <= '11-30') return 'Buen Fin';
  if (md >= '12-01' && md <= '12-31') return 'Navidad (regalos)';
  return 'Temporada de compra';
}

/**
 * Próximas temporadas según el calendario existente de logros (`lib/achievements/calendar`).
 * Recorre días civiles de México y agrupa ventanas contiguas; no inventa fechas.
 */
export function upcomingSeasons(todayYmd: string, horizonDays = 240, limit = 3): SeasonWindow[] {
  const out: SeasonWindow[] = [];
  let i = 0;
  while (i <= horizonDays && out.length < limit) {
    const day = addCalendarDays(todayYmd, i);
    const bf = isBlackFridayWindow(day);
    if (bf || isSeasonWindow(day)) {
      let j = i;
      while (j + 1 <= horizonDays + 31) {
        const next = addCalendarDays(todayYmd, j + 1);
        const nextBf = isBlackFridayWindow(next);
        const sameKind = bf ? nextBf : isSeasonWindow(next) && !nextBf;
        if (!sameKind) break;
        j += 1;
      }
      let startIdx = i;
      while (i === 0 && startIdx > -31) {
        const prev = addCalendarDays(todayYmd, startIdx - 1);
        const prevMatch = bf ? isBlackFridayWindow(prev) : isSeasonWindow(prev) && !isBlackFridayWindow(prev);
        if (!prevMatch) break;
        startIdx -= 1;
      }
      const start = addCalendarDays(todayYmd, startIdx);
      out.push({
        id: `${start}-${bf ? 'bf' : 'season'}`,
        name: seasonName(start, bf),
        start,
        end: addCalendarDays(todayYmd, j),
        daysUntil: Math.max(0, i),
        active: i === 0,
      });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

export function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
