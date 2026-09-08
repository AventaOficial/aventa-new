import { describe, expect, it } from 'vitest';
import {
  coprimeStride,
  cycleIndexFor,
  ML_SEED_REGISTRY,
  resolveSeeds,
  rotateSeeds,
  SEED_ROTATION_INTERVAL_MS,
} from '../../workers/mercadolibre-worker/src/seeds.mjs';
import { perSeedCap } from '../../workers/mercadolibre-worker/src/ml.mjs';

type Seed = { id: string; url: string };

const ids = (seeds: Seed[]) => seeds.map((s) => s.id);

describe('FASE 5 rotación determinista de seeds', () => {
  it('A. el registro no tiene ids ni urls duplicadas', () => {
    const seedIds = ML_SEED_REGISTRY.map((s: Seed) => s.id);
    const urls = ML_SEED_REGISTRY.map((s: Seed) => s.url);
    expect(new Set(seedIds).size).toBe(seedIds.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('B. todas las seeds son superficies públicas de ofertas de Mercado Libre', () => {
    for (const seed of ML_SEED_REGISTRY as Seed[]) {
      const url = new URL(seed.url);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('www.mercadolibre.com.mx');
      expect(url.pathname).toBe('/ofertas');
    }
  });

  it('C. el mismo índice de ciclo produce siempre el mismo orden', () => {
    const a = resolveSeeds({ cycleIndex: 7 });
    const b = resolveSeeds({ cycleIndex: 7 });
    expect(ids(a)).toEqual(ids(b));
  });

  it('D. ciclos consecutivos NO empiezan por la misma seed', () => {
    // El bug original: siempre el mismo orden, así que la cuota se agotaba en
    // las primeras seeds y el resto del registro no se visitaba nunca.
    const first = resolveSeeds({ cycleIndex: 0 })[0]!.id;
    const second = resolveSeeds({ cycleIndex: 1 })[0]!.id;
    const third = resolveSeeds({ cycleIndex: 2 })[0]!.id;
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('E. la rotación recorre el registro completo sin repetir antes de tiempo', () => {
    const total = ML_SEED_REGISTRY.length;
    const firstSeeds = new Set<string>();
    for (let cycle = 0; cycle < total; cycle++) {
      firstSeeds.add(resolveSeeds({ cycleIndex: cycle })[0]!.id);
    }
    expect(firstSeeds.size).toBe(total);
  });

  it('F. la rotación nunca pierde ni duplica seeds', () => {
    for (const cycle of [0, 1, 5, 13, 99, 1000]) {
      const rotated = resolveSeeds({ cycleIndex: cycle });
      expect(rotated).toHaveLength(ML_SEED_REGISTRY.length);
      expect(new Set(ids(rotated)).size).toBe(ML_SEED_REGISTRY.length);
    }
  });

  it('G. índices negativos o inválidos no rompen la rotación', () => {
    expect(ids(resolveSeeds({ cycleIndex: -3 }))).toHaveLength(ML_SEED_REGISTRY.length);
    expect(ids(resolveSeeds({ cycleIndex: Number.NaN }))).toHaveLength(ML_SEED_REGISTRY.length);
  });

  it('H. el stride es coprimo con el total, que es lo que garantiza cobertura', () => {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    for (let total = 3; total <= 30; total++) {
      expect(gcd(coprimeStride(total), total)).toBe(1);
    }
  });

  it('I. el índice de ciclo se deriva del reloj, sin estado compartido', () => {
    const base = Date.parse('2026-09-08T20:00:00.000Z');
    // Dos runners del MISMO ciclo tienen que elegir las mismas seeds.
    expect(cycleIndexFor(base, SEED_ROTATION_INTERVAL_MS)).toBe(
      cycleIndexFor(base + 60_000, SEED_ROTATION_INTERVAL_MS)
    );
    // Y el ciclo siguiente tiene que ser otro.
    expect(cycleIndexFor(base + SEED_ROTATION_INTERVAL_MS, SEED_ROTATION_INTERVAL_MS)).toBe(
      cycleIndexFor(base, SEED_ROTATION_INTERVAL_MS) + 1
    );
  });

  it('J. el override manual gana sobre el registro y también rota', () => {
    const override = ['https://a.example/ofertas', 'https://b.example/ofertas', 'https://c.example/ofertas'];
    const seeds = resolveSeeds({ override, cycleIndex: 0 });
    expect(seeds).toHaveLength(3);
    expect(seeds.every((s: Seed) => s.url.includes('example'))).toBe(true);
    const rotated = resolveSeeds({ override, cycleIndex: 1 });
    expect(rotated[0]!.url).not.toBe(seeds[0]!.url);
  });

  it('K. un override vacío cae al registro en vez de dejar el worker sin seeds', () => {
    expect(resolveSeeds({ override: [], cycleIndex: 0 })).toHaveLength(ML_SEED_REGISTRY.length);
    expect(resolveSeeds({ override: ['', '   '], cycleIndex: 0 })).toHaveLength(
      ML_SEED_REGISTRY.length
    );
  });

  it('L. rotateSeeds tolera listas vacías o de un solo elemento', () => {
    expect(rotateSeeds([], 5)).toEqual([]);
    expect(rotateSeeds([{ id: 'solo' }], 5)).toEqual([{ id: 'solo' }]);
  });
});

describe('FASE 5 cupo por seed', () => {
  it('M. el cupo reparte amplitud en vez de agotarse en las primeras seeds', () => {
    // Config real del workflow: 36 candidatos, 14 seeds.
    const cap = perSeedCap({ maxItems: 36, seedCount: 14 });
    expect(cap).toBe(3);
    // Con ese cupo el ciclo alcanza a visitar la mayor parte del registro.
    expect(Math.floor(36 / cap)).toBeGreaterThanOrEqual(12);
  });

  it('N. la config anterior sí agotaba la cuota en pocas seeds', () => {
    // Regresión documentada: 28 items con cupo 5 solo llegaba a ~6 seeds de 12.
    const viejoCap = Math.max(4, Math.ceil(28 / 12) + 2);
    expect(Math.floor(28 / viejoCap)).toBeLessThan(7);
  });

  it('O. un cupo explícito manda sobre el calculado', () => {
    expect(perSeedCap({ maxItems: 36, seedCount: 14, explicitCap: 5 })).toBe(5);
  });

  it('P. el cupo nunca baja de 2 ni se vuelve cero con muchas seeds', () => {
    expect(perSeedCap({ maxItems: 4, seedCount: 100 })).toBe(2);
    expect(perSeedCap({ maxItems: 0, seedCount: 10 })).toBe(2);
  });
});
