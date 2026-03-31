import { describe, it, expect } from 'vitest';
import { formatYmdInTz, startOfZonedDayUtc } from '@/lib/bots/ingest/ingestZonedTime';

describe('ingestZonedTime', () => {
  it('startOfZonedDayUtc alinea con formatYmdInTz para America/Mexico_City', () => {
    const tz = 'America/Mexico_City';
    const ref = new Date('2025-06-15T18:30:00.000Z');
    const ymd = formatYmdInTz(ref, tz);
    const start = startOfZonedDayUtc(ymd, tz);
    expect(formatYmdInTz(start, tz)).toBe(ymd);
    expect(start.getTime()).toBeLessThanOrEqual(ref.getTime());
    const before = new Date(start.getTime() - 1);
    expect(formatYmdInTz(before, tz)).not.toBe(ymd);
  });
});
