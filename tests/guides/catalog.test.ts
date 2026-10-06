import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/app/descubre/guides/content';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const bodies = GUIDES.flatMap((guide) => guide.steps.flatMap((step) => step.body)).join('\n');

describe('catálogo de guías', () => {
  it('tiene cuatro guías y entre 25 y 30 pasos, sin ids repetidos', () => {
    expect(GUIDES.map((guide) => guide.title)).toEqual([
      'Conoce Aventa',
      'Conviértete en Cazador',
      'Aprende a ahorrar',
      'Gana con Aventa',
    ]);
    const steps = GUIDES.flatMap((guide) => guide.steps);
    expect(steps.length).toBeGreaterThanOrEqual(25);
    expect(steps.length).toBeLessThanOrEqual(30);
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
    expect(new Set(steps.map((step) => step.title)).size).toBe(steps.length);
  });

  it('no enseña el hueco interno del catálogo ni promete Rewards universal', () => {
    const hub = readFileSync(join(process.cwd(), 'app/descubre/components/GuideHub.tsx'), 'utf8');
    expect(hub).not.toMatch(/Qué le falta al catálogo/);
    expect(hub).not.toMatch(/CatalogGapsBoard/);
    expect(bodies).toMatch(/no cualquier compra/);
    expect(bodies).not.toMatch(/cualquier compra genera/i);
    expect(bodies).not.toMatch(/te pagamos/i);
    expect(bodies).not.toMatch(/dinero garantizado/i);
    expect(bodies).toMatch(/No está disponible para todas las cuentas/);
    expect(bodies).toMatch(/no tiene Rewards activo/);
    expect(bodies).toMatch(/PENDING/);
    expect(bodies).toMatch(/CANCELLED/);
    expect(bodies).toMatch(/REVERSED/);
    expect(bodies).toMatch(/Nivel Aventa/);
  });
});
