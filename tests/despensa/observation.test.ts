import { describe, expect, it } from 'vitest';
import {
  assessSaving,
  dedupeObservations,
  historyStatus,
  normalizeObservation,
  observationSkuKey,
  type DespensaPriceObservation,
  type RawObservationInput,
} from '@/lib/despensa/observation';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const daysAgo = (d: number, h = 0) => new Date(NOW.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();

const raw = (o: Partial<RawObservationInput> = {}): RawObservationInput => ({
  url: 'https://www.walmart.com.mx/ip/arroz-prueba-1kg/1',
  title: 'Arroz blanco Prueba 1 kg',
  pageTitle: 'Arroz blanco Prueba 1 kg | Walmart',
  price: 32,
  currency: 'MXN',
  observedAt: daysAgo(0, 1),
  brand: 'Prueba',
  region: { scope: 'online_unknown', label: null },
  availability: 'in_stock',
  agent: { kind: 'grok_bot', id: 'grok-a' },
  ...o,
});

function obs(o: Partial<RawObservationInput> = {}): DespensaPriceObservation {
  const r = normalizeObservation(raw(o), NOW);
  if (!r.ok) throw new Error(r.reasons.join(','));
  return r.observation;
}

describe('observación de precio', () => {
  it('normaliza producto, variante, contenido, precio unitario y fuente', () => {
    const o = obs({ url: 'https://www.walmart.com.mx/ip/arroz-prueba-1kg/1?utm=x#top' });
    expect(o).toMatchObject({
      needId: 'alimentos.arroz',
      variantId: 'blanco',
      brand: 'Prueba',
      storeHost: 'walmart.com.mx',
      sourceId: 'walmart_mx',
      canonicalUrl: 'https://www.walmart.com.mx/ip/arroz-prueba-1kg/1',
      unitPrice: { dimension: 'mass', value: 32, per: 'kg' },
      currency: 'MXN',
      confidence: 'high',
      verification: 'link_title_matches',
    });
    expect(o.evidence.listPrice).toBeNull();
  });

  it('rechaza en vez de adivinar', () => {
    const reasons = (o: Partial<RawObservationInput>) => {
      const r = normalizeObservation(raw(o), NOW);
      return r.ok ? [] : r.reasons;
    };
    expect(reasons({ pageTitle: 'Pantalla Smart TV 55 pulgadas' })).toContain('link_title_mismatch');
    expect(reasons({ needId: 'alimentos.frijol' })).toContain('need_mismatch');
    expect(reasons({ price: 0 })).toContain('invalid_price');
    expect(reasons({ currency: 'USD' })).toContain('invalid_currency');
    expect(reasons({ observedAt: daysAgo(-1) })).toContain('invalid_observed_at');
    expect(reasons({ listPrice: 30 })).toContain('invalid_list_price');
    expect(reasons({ url: 'http://www.walmart.com.mx/ip/1' })).toContain('invalid_url');
    expect(reasons({ agent: { kind: 'grok_bot', id: ' ' } })).toContain('missing_agent');
  });

  it('sin región declarada no asume cobertura nacional', () => {
    expect(obs({ region: null }).region).toEqual({ scope: 'online_unknown', label: null });
  });
});

describe('deduplicación e historial', () => {
  it('agrupa la misma presentación, tienda y región en la ventana sin perder procedencia', () => {
    const a = obs({ agent: { kind: 'grok_bot', id: 'grok-a' } });
    const b = obs({ agent: { kind: 'grok_bot', id: 'grok-b' }, observedAt: daysAgo(0, 2) });
    const otherSize = obs({ title: 'Arroz blanco Prueba 900 g', pageTitle: 'Arroz blanco Prueba 900 g' });
    const otherStore = obs({ region: { scope: 'physical_store', label: 'Sucursal Centro' } });
    const { groups, duplicates } = dedupeObservations([a, b, otherSize, otherStore]);
    expect(duplicates).toBe(1);
    expect(groups).toHaveLength(3);
    expect(groups[0].provenance.map((p) => p.agentId)).toEqual(['grok-a', 'grok-b']);
    expect(observationSkuKey(a)).not.toBe(observationSkuKey(otherSize));
  });

  it('una observación es una observación; el mismo precio repetido no crea historial', () => {
    expect(historyStatus([]).status).toBe('none');
    expect(historyStatus([obs()]).status).toBe('single_observation');
    const sameDay = [obs(), obs({ observedAt: daysAgo(0, 3) }), obs({ observedAt: daysAgo(0, 5) })];
    expect(historyStatus(sameDay)).toMatchObject({ status: 'single_observation', independent: 1 });
    const threeDays = [obs(), obs({ observedAt: daysAgo(1) }), obs({ observedAt: daysAgo(2) })];
    expect(historyStatus(threeDays).status).toBe('insufficient');
    const longRun = [0, 5, 10, 15].map((d) => obs({ observedAt: daysAgo(d, 1) }));
    expect(historyStatus(longRun)).toMatchObject({ status: 'longitudinal', independent: 4 });
  });

  it('no suma presentaciones distintas como historial', () => {
    expect(() => historyStatus([obs(), obs({ title: 'Arroz blanco Prueba 900 g', pageTitle: 'Arroz blanco Prueba 900 g' })])).toThrow();
  });
});

describe('ahorro verificable', () => {
  it('sin historial longitudinal solo afirma el precio, aunque la tienda muestre precio de lista', () => {
    const current = obs({ listPrice: 45 });
    const s = assessSaving(current, [obs({ observedAt: daysAgo(3), price: 40 })]);
    expect(s).toMatchObject({ claim: 'price_only', reference: null, verifiedDropPct: null, history: 'single_observation' });
  });

  it('con historial propio longitudinal verifica una bajada real y nada más', () => {
    const prior = [3, 8, 13, 18].map((d) => obs({ observedAt: daysAgo(d), price: 40 }));
    expect(assessSaving(obs({ price: 34 }), prior)).toMatchObject({
      claim: 'verified_drop',
      reference: { kind: 'own_history_median', price: 40, observations: 4 },
      difference: 6,
      verifiedDropPct: 15,
    });
    expect(assessSaving(obs({ price: 39 }), prior)).toMatchObject({ claim: 'no_drop', verifiedDropPct: null });
  });

  it('el historial de otra tienda o presentación no cuenta como referencia', () => {
    const otherStore = [3, 8, 13, 18].map((d) => obs({ observedAt: daysAgo(d), price: 40, region: { scope: 'physical_store', label: 'Sucursal Centro' } }));
    expect(assessSaving(obs({ price: 30 }), otherStore).claim).toBe('price_only');
  });
});
