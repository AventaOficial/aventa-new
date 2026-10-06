import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEASONS, resolveActiveSeason, seasonWindowsOverlap, type SeasonDefinition } from '@/lib/seasons/resolve';

describe('temporada activa', () => {
  it('resuelve una sola temporada y ninguna fuera de ventana', () => {
    expect(seasonWindowsOverlap()).toBe(false);
    expect(resolveActiveSeason(new Date('2026-10-05T18:00:00-06:00'))).toBeNull();
    expect(resolveActiveSeason(new Date('2026-11-01T00:30:00-06:00'))?.id).toBe('dia-de-muertos');
    expect(resolveActiveSeason(new Date('2026-11-02T23:00:00-06:00'))?.id).toBe('dia-de-muertos');
    expect(resolveActiveSeason(new Date('2026-11-03T00:30:00-06:00'))).toBeNull();
    expect(resolveActiveSeason(new Date('2026-11-15T12:00:00-06:00'))?.id).toBe('buen-fin');
    expect(resolveActiveSeason(new Date('2026-12-10T12:00:00-06:00'))?.id).toBe('navidad');
  });

  it('rechaza dos temporadas activas al mismo tiempo', () => {
    const overlap: SeasonDefinition[] = [
      { ...SEASONS[0]!, id: 'a', startAt: '2026-11-01T00:00:00-06:00', endAt: '2026-11-10T00:00:00-06:00' },
      { ...SEASONS[0]!, id: 'b', startAt: '2026-11-05T00:00:00-06:00', endAt: '2026-11-12T00:00:00-06:00' },
    ];
    expect(seasonWindowsOverlap(overlap)).toBe(true);
    expect(() => resolveActiveSeason(new Date('2026-11-06T00:00:00-06:00'), overlap)).toThrow(/temporada duplicada/);
  });

  it('Home no nombra la temporada: la lee del resolvedor', () => {
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(home).toMatch(/resolveActiveSeason/);
    expect(home).not.toMatch(/Día de Muertos|Buen Fin|Navidad/);
  });
});
