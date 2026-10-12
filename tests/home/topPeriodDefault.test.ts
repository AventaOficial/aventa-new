import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOP_PERIOD,
  resolveHomeFeedEmptyState,
  resolveHomeFeedPeriod,
} from '@/lib/offers/homeFeedClient';
import { feedHomeQuerySchema } from '@/lib/contracts/feed';

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

describe('FT-03 — Top abre en «Semana»', () => {
  it('el periodo por defecto es semana y el API lo acepta', () => {
    expect(DEFAULT_TOP_PERIOD).toBe('week');
    expect(resolveHomeFeedPeriod('top', DEFAULT_TOP_PERIOD)).toBe('week');
    const parsed = feedHomeQuerySchema.safeParse({ view: 'top', period: DEFAULT_TOP_PERIOD });
    expect(parsed.success && parsed.data.period).toBe('week');
  });

  it('Recientes y Día a día siguen fijos en semana', () => {
    expect(resolveHomeFeedPeriod('latest', 'day')).toBe('week');
    expect(resolveHomeFeedPeriod('vitales', 'month')).toBe('week');
  });

  it('la portada arranca con DEFAULT_TOP_PERIOD y conserva el selector Hoy/Semana/Mes', () => {
    expect(page).toContain('useState<TimeFilter>(DEFAULT_TOP_PERIOD)');
    expect(page).not.toContain("useState<TimeFilter>('day')");
    expect(page).toContain("{ value: 'day' as const, label: 'Hoy' }");
    expect(page).toContain("{ value: 'week' as const, label: 'Semana' }");
  });
});

describe('FT-03 — vacío coherente con el carrusel', () => {
  const base = { viewMode: 'top' as const, listCount: 0, featuredCount: 0, searching: false };

  it('Top sin lista pero con destacados ⇒ aviso de periodo, no «Aún no hay ofertas»', () => {
    expect(resolveHomeFeedEmptyState({ ...base, featuredCount: 4 })).toBe('top_period');
  });

  it('Top sin lista ni destacados ⇒ vacío global', () => {
    expect(resolveHomeFeedEmptyState(base)).toBe('no_offers');
  });

  it('otras pestañas no cambian', () => {
    expect(resolveHomeFeedEmptyState({ ...base, viewMode: 'latest', featuredCount: 4 })).toBe('no_offers');
    expect(resolveHomeFeedEmptyState({ ...base, viewMode: 'vitales' })).toBe('no_offers');
  });

  it('con lista o con búsqueda no hay vacío', () => {
    expect(resolveHomeFeedEmptyState({ ...base, listCount: 3 })).toBe('none');
    expect(resolveHomeFeedEmptyState({ ...base, searching: true })).toBe('none');
  });

  it('la portada usa el estado resuelto', () => {
    expect(page).toContain("emptyState === 'top_period'");
    expect(page).toContain("emptyState === 'no_offers'");
    expect(page).toContain('featuredCount: featuredOffers.length');
  });
});
