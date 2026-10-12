import { describe, expect, it } from 'vitest';
import { discountIsVerified, evidenceFreshness, evidenceLevel } from '@/lib/despensa/evidence';
import { DESPENSA_RANK_RULES, rankDespensa } from '@/lib/despensa/rank';
import { despensaFeedMetrics } from '@/lib/despensa/metrics';

const NOW = new Date('2026-10-11T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

type Offer = {
  id: string;
  title: string;
  discountPrice: number;
  votes: { score: number };
  createdAt?: string | null;
  expiresAt?: string | null;
  sourceHost?: string | null;
};

const offer = (o: Partial<Offer> & Pick<Offer, 'id' | 'title'>): Offer => ({
  discountPrice: 100,
  votes: { score: 0 },
  createdAt: hoursAgo(1),
  sourceHost: 'walmart.com.mx',
  ...o,
});

const ids = (list: readonly { id?: string | null }[]) => list.map((o) => o.id);

describe('evidencia', () => {
  it('clasifica por lo que el feed sabe de verdad', () => {
    expect(evidenceLevel({ title: 'Arroz 1 kg', price: 30, sourceHost: 'walmart.com.mx', expiresAt: hoursAgo(-48) }, NOW)).toBe('published_with_validity');
    expect(evidenceLevel({ title: 'Arroz 1 kg', price: 30, sourceUrl: 'https://www.walmart.com.mx/ip/123' }, NOW)).toBe('published_source');
    expect(evidenceLevel({ title: 'Arroz 1 kg', price: 30, sourceHost: 'walmart.com.mx', expiresAt: hoursAgo(1) }, NOW)).toBe('published_source');
    expect(evidenceLevel({ title: 'Arroz 1 kg', price: 30, sourceHost: 'tiendita-local.mx' }, NOW)).toBe('reported');
    expect(evidenceLevel({ title: 'Arroz 1 kg', price: 0, sourceHost: 'walmart.com.mx' }, NOW)).toBe('incomplete');
  });

  it('nunca confirma un descuento sin historial', () => {
    expect(discountIsVerified()).toBe(false);
  });

  it('distingue fresca, reciente, vieja y desconocida', () => {
    expect(evidenceFreshness(hoursAgo(10), NOW, 7)).toBe('fresh');
    expect(evidenceFreshness(hoursAgo(24 * 5), NOW, 7)).toBe('recent');
    expect(evidenceFreshness(hoursAgo(24 * 8), NOW, 7)).toBe('stale');
    expect(evidenceFreshness(null, NOW, 7)).toBe('unknown');
  });
});

describe('ranking de Despensa', () => {
  it('es determinista: misma entrada en cualquier orden produce el mismo resultado', () => {
    const list = [
      offer({ id: 'a', title: 'Arroz 1 kg', votes: { score: 3 } }),
      offer({ id: 'b', title: 'Frijol 1 kg', votes: { score: 3 } }),
      offer({ id: 'c', title: 'Audífonos', votes: { score: 9 } }),
      offer({ id: 'd', title: 'Aceite vegetal 1 L', votes: { score: 3 }, createdAt: hoursAgo(1) }),
    ];
    const once = ids(rankDespensa(list, { now: NOW }).ranked);
    const reversed = ids(rankDespensa([...list].reverse(), { now: NOW }).ranked);
    expect(once).toEqual(reversed);
    expect(rankDespensa(list, { now: NOW }).rulesVersion).toBe(DESPENSA_RANK_RULES.version);
  });

  it('los votos no superan una mejor evidencia', () => {
    const list = [
      offer({ id: 'popular', title: 'Arroz 1 kg', votes: { score: 80 }, sourceHost: null }),
      offer({ id: 'verificada', title: 'Arroz 1 kg', votes: { score: 0 } }),
    ];
    expect(ids(rankDespensa(list, { now: NOW }).ranked)).toEqual(['verificada', 'popular']);
  });

  it('una necesidad del catálogo va antes que un producto ajeno, aunque tenga más votos', () => {
    const list = [
      offer({ id: 'gadget', title: 'Bocina bluetooth', votes: { score: 50 } }),
      offer({ id: 'papel', title: 'Papel higiénico 12 rollos', votes: { score: 1 } }),
    ];
    expect(ids(rankDespensa(list, { now: NOW }).ranked)).toEqual(['papel', 'gadget']);
  });

  it('el dato faltante no da ventaja: sin presentación queda detrás de la comparable', () => {
    const list = [
      offer({ id: 'sin_presentacion', title: 'Detergente líquido', votes: { score: 20 } }),
      offer({ id: 'con_presentacion', title: 'Detergente líquido 3 L', votes: { score: 0 } }),
    ];
    expect(ids(rankDespensa(list, { now: NOW }).ranked)).toEqual(['con_presentacion', 'sin_presentacion']);
  });

  it('la fecha desconocida no gana a una fecha fresca', () => {
    const list = [
      offer({ id: 'sin_fecha', title: 'Arroz 1 kg', createdAt: null, votes: { score: 10 } }),
      offer({ id: 'fresca', title: 'Arroz 1 kg', createdAt: hoursAgo(2) }),
    ];
    expect(ids(rankDespensa(list, { now: NOW }).ranked)).toEqual(['fresca', 'sin_fecha']);
  });

  it('la evidencia vieja y la incompleta dejan de competir, sin borrarse', () => {
    const list = [
      offer({ id: 'vieja', title: 'Arroz 1 kg', createdAt: hoursAgo(24 * 10), votes: { score: 50 } }),
      offer({ id: 'sin_precio', title: 'Arroz 1 kg', discountPrice: 0 }),
      offer({ id: 'ok', title: 'Arroz 1 kg' }),
    ];
    const out = rankDespensa(list, { now: NOW });
    expect(ids(out.ranked)).toEqual(['ok']);
    expect(ids(out.demoted)).toEqual(['vieja', 'sin_precio']);
    expect(out.demotions.map((d) => d.reason)).toEqual(['stale_evidence', 'incomplete']);
  });

  it('las preferencias solo desempatan entre ofertas de igual calidad', () => {
    const list = [
      offer({ id: 'arroz', title: 'Arroz 1 kg' }),
      offer({ id: 'panales', title: 'Pañales 40 piezas', sourceHost: null }),
      offer({ id: 'panales_ok', title: 'Pañales 40 piezas' }),
    ];
    const out = rankDespensa(list, { now: NOW, preferredNeedIds: new Set(['bebes.panales']) });
    expect(ids(out.ranked)).toEqual(['panales_ok', 'arroz', 'panales']);
    const none = rankDespensa(list, { now: NOW, preferredNeedIds: new Set() });
    expect(none.ranked).toHaveLength(3);
  });

  it('una necesidad no satura el inicio', () => {
    const list = [1, 2, 3, 4, 5].map((n) => offer({ id: `arroz${n}`, title: `Arroz ${n} kg` }));
    list.push(offer({ id: 'frijol', title: 'Frijol 1 kg', createdAt: hoursAgo(5) }));
    const out = ids(rankDespensa(list, { now: NOW }).ranked);
    expect(out.indexOf('frijol')).toBe(DESPENSA_RANK_RULES.maxPerNeed);
    expect(out).toHaveLength(6);
  });
});

describe('métricas del listado', () => {
  it('cuenta con datos reales y deja el origen como pendiente si no viene', () => {
    const list = [
      offer({ id: 'a', title: 'Arroz 1 kg' }),
      offer({ id: 'b', title: 'Arroz 1 kg' }),
      offer({ id: 'c', title: 'Bocina bluetooth', sourceHost: null }),
    ];
    const m = despensaFeedMetrics(list, NOW);
    expect(m).toMatchObject({ total: 3, withNeed: 2, withUnitPrice: 2, duplicateProducts: 1, machineShare: null });
    expect(m.byFamily).toEqual({ alimentacion_basica: 2 });
    expect(m.evidence.history_confirmed).toBe(0);
    expect(m.evidence.reported).toBe(1);
    const withOrigin = despensaFeedMetrics(
      list.map((o, i) => ({ ...o, origin: i === 0 ? ('machine' as const) : ('community' as const) })),
      NOW,
    );
    expect(withOrigin.machineShare).toBeCloseTo(1 / 3);
  });
});
