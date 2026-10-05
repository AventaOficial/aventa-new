import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatMexicoShortDate, formatRelativeMexico } from '@/lib/time/mexicoClock';

const detail = readFileSync(join(process.cwd(), 'app/oferta/[id]/OfferPageContent.tsx'), 'utf8');

describe('offer detail: text that depends on the clock (React #418)', () => {
  const created = '2026-10-04T05:30:00.000Z';

  it('server and hydration render the same short date in Mexico City, whatever the hour', () => {
    expect(formatRelativeMexico(created, null)).toBe(formatMexicoShortDate(created));
    expect(formatMexicoShortDate(created)).toMatch(/^3 oct/);
  });

  it('switches to relative text once the browser clock is known', () => {
    const t = Date.parse(created);
    expect(formatRelativeMexico(created, t + 20_000)).toBe('Ahora mismo');
    expect(formatRelativeMexico(created, t + 5 * 60_000)).toBe('hace 5 min');
    expect(formatRelativeMexico(created, t + 3 * 3_600_000)).toBe('hace 3h');
    expect(formatRelativeMexico(created, t + 3 * 86_400_000)).toBe('hace 3 días');
    expect(formatRelativeMexico(created, t + 40 * 86_400_000)).toBe(formatMexicoShortDate(created));
    expect(formatRelativeMexico('no-date', t)).toBe('');
  });

  it('the page reads the clock only after hydration', () => {
    expect(detail).toMatch(/useHydrated\(\)/);
    expect(detail).toMatch(/const nowMs = hydrated \? Date\.now\(\) : null/);
    expect(detail).not.toMatch(/remainingDaysLabel\([^)]*Date\.now\(\)/);
    expect(detail).not.toMatch(/new Date\(\)/);
    expect(detail).not.toMatch(/toLocale(Date|Time)?String\(/);
    expect(detail).not.toMatch(/Math\.random\(/);
  });

  it('comments are not polled', () => {
    expect(detail).not.toMatch(/setInterval\(/);
  });
});
