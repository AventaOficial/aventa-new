import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { activeDespensaNeeds } from '@/lib/despensa/catalog';
import { buildDespensaBudget, type DespensaBudget } from '@/lib/despensa/budget';
import {
  buildDespensaPlan,
  DESPENSA_AISLES,
  DESPENSA_LIST_MAX_ITEMS,
  despensaAisleFor,
  estimateDespensaList,
  parseDespensaList,
  type DespensaOffer,
  type DespensaPick,
} from '@/lib/despensa/plan';
import { DESPENSA_RANK_RULES, rankDespensa } from '@/lib/despensa/rank';
import { DespensaPickDetails } from '@/app/despensa/DespensaPickDetails';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const UPDATED = '2026-10-12T00:00:00.000Z';

const budget = (horizon: 'weekly' | 'monthly', tier: 'low' | 'medium' | 'high' | 'custom', amountMxn?: number): DespensaBudget => {
  const b = buildDespensaBudget({ horizon, tier, amountMxn: amountMxn ?? null, now: new Date(UPDATED) });
  if (!b) throw new Error('presupuesto inválido en el test');
  return b;
};

const offer = (o: Partial<DespensaOffer> & Pick<DespensaOffer, 'id' | 'title'>): DespensaOffer => ({
  discountPrice: 50,
  originalPrice: null,
  store: 'Walmart',
  sourceHost: 'walmart.com.mx',
  imageUrl: null,
  createdAt: hoursAgo(1),
  expiresAt: null,
  votes: { score: 0 },
  offerScope: 'online',
  priceHistory: null,
  ...o,
});

const strongHistory = (max: number, current: number) => ({ verdict: 'strong' as const, min90d: current, max90d: max, samples90d: 3 });
const labelOnlyHistory = { verdict: 'label_only' as const, min90d: 20, max90d: 35, samples90d: 4 };

function picksOf(plan: ReturnType<typeof buildDespensaPlan>, needId: string): DespensaPick[] {
  return plan.needs.find((n) => n.need.id === needId)?.picks ?? [];
}
const pickIds = (picks: readonly DespensaPick[]) => picks.map((p) => p.offer.id);
const html = (pick: DespensaPick) => renderToStaticMarkup(createElement(DespensaPickDetails, { pick }));

describe('pasillos', () => {
  it('cada necesidad activa del catálogo está en exactamente un pasillo', () => {
    for (const need of activeDespensaNeeds()) {
      const hits = DESPENSA_AISLES.filter((a) => (a.needIds as readonly string[]).includes(need.id));
      expect(hits.map((a) => a.id), need.id).toHaveLength(1);
    }
  });

  it('cubre los grupos de consumo pedidos', () => {
    expect(DESPENSA_AISLES.map((a) => a.label)).toEqual(
      expect.arrayContaining([
        'Despensa seca',
        'Cereales, arroz, pastas y tortillas',
        'Leguminosas',
        'Aceites',
        'Leche',
        'Huevo y proteínas',
        'Frutas y verduras',
        'Higiene personal',
        'Limpieza del hogar',
        'Mascotas',
      ]),
    );
  });
});

describe('presupuestos', () => {
  const arroz = offer({ id: 'arroz', title: 'Arroz blanco 1 kg', discountPrice: 30 });
  const panales = offer({ id: 'panales', title: 'Pañales 120 piezas', discountPrice: 420 });

  it('semanal $500: lo barato cabe y lo caro relevante se muestra con aviso', () => {
    const plan = buildDespensaPlan([arroz, panales], { now: NOW, budget: budget('weekly', 'low') });
    const [a] = picksOf(plan, 'alimentos.arroz');
    const [p] = picksOf(plan, 'bebes.panales');
    expect(a.budgetFit).toBe('fits');
    expect(a.reasons).toContain('Equivale a 6% de tu presupuesto semanal.');
    expect(p.budgetFit).toBe('over_share');
    expect(p.notes).toContain('over_budget_share');
  });

  it('semanal $1,000: el tope por oferta sube a $250', () => {
    const plan = buildDespensaPlan([panales, offer({ id: 'p2', title: 'Pañales 40 piezas', discountPrice: 240 })], {
      now: NOW,
      budget: budget('weekly', 'medium'),
    });
    const fits = Object.fromEntries(picksOf(plan, 'bebes.panales').map((p) => [p.offer.id, p.budgetFit]));
    expect(fits).toEqual({ panales: 'over_share', p2: 'fits' });
  });

  it('mensual $2,000: se compara contra el equivalente semanal', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'cabe', title: 'Pañales 40 piezas', discountPrice: 110 }),
        offer({ id: 'excede', title: 'Pañales 80 piezas', discountPrice: 120 }),
      ],
      { now: NOW, budget: budget('monthly', 'low') },
    );
    const byId = Object.fromEntries(picksOf(plan, 'bebes.panales').map((p) => [p.offer.id, p]));
    expect(byId.cabe.budgetFit).toBe('fits');
    expect(byId.cabe.reasons).toContain('Equivale a 24% de tu presupuesto mensual llevado a una semana.');
    expect(byId.excede.budgetFit).toBe('over_share');
  });

  it('presupuesto personalizado', () => {
    const custom = budget('weekly', 'custom', 1800);
    expect(custom.amountMxn).toBe(1800);
    const plan = buildDespensaPlan([panales], { now: NOW, budget: custom });
    expect(picksOf(plan, 'bebes.panales')[0].budgetFit).toBe('fits');
    const menor = buildDespensaPlan([panales], { now: NOW, budget: budget('weekly', 'custom', 1500) });
    expect(picksOf(menor, 'bebes.panales')[0].budgetFit).toBe('over_share');
  });

  it('sin presupuesto: no hay motivo ni aviso de presupuesto', () => {
    const plan = buildDespensaPlan([arroz, panales], { now: NOW });
    for (const n of plan.needs) {
      for (const p of n.picks) {
        expect(p.budgetFit).toBe('no_budget');
        expect(p.notes).not.toContain('over_budget_share');
        expect(p.reasons.join(' ')).not.toMatch(/presupuesto/);
      }
    }
  });

  it('cambiar el presupuesto reordena dentro de la necesidad sin ocultar ofertas', () => {
    const list = [
      offer({ id: 'barato', title: 'Arroz blanco Verde Valle', discountPrice: 35, votes: { score: 0 } }),
      offer({ id: 'caro', title: 'Arroz blanco bulto familiar', discountPrice: 200, votes: { score: 9 } }),
    ];
    const sinPresupuesto = pickIds(picksOf(buildDespensaPlan(list, { now: NOW }), 'alimentos.arroz'));
    const conPresupuesto = pickIds(picksOf(buildDespensaPlan(list, { now: NOW, budget: budget('weekly', 'low') }), 'alimentos.arroz'));
    const amplio = pickIds(picksOf(buildDespensaPlan(list, { now: NOW, budget: budget('weekly', 'high') }), 'alimentos.arroz'));
    expect(sinPresupuesto).toEqual(['caro', 'barato']);
    expect(conPresupuesto).toEqual(['barato', 'caro']);
    expect(amplio).toEqual(['caro', 'barato']);
  });
});

describe('evidencia del precio', () => {
  it('producto esencial sin descuento: precio observado, sin hablar de ahorro', () => {
    const plan = buildDespensaPlan([offer({ id: 'f', title: 'Frijol negro 900 g', discountPrice: 38 })], { now: NOW });
    const [p] = picksOf(plan, 'alimentos.frijol');
    expect(p.status).toBe('observed_price');
    expect(p.saving).toEqual({ status: 'none' });
    expect(html(p)).not.toMatch(/ahorr|menos que/i);
  });

  it('ahorro verificable: el historial propio lo respalda y sube frente a un igual sin historial', () => {
    const list = [
      offer({ id: 'sin', title: 'Arroz blanco 1 kg', discountPrice: 32, votes: { score: 5 } }),
      offer({ id: 'con', title: 'Arroz blanco 1 kg', discountPrice: 32, priceHistory: strongHistory(40, 32) }),
    ];
    const plan = buildDespensaPlan(list, { now: NOW });
    const picks = picksOf(plan, 'alimentos.arroz');
    expect(pickIds(picks)).toEqual(['con', 'sin']);
    expect(picks[0].status).toBe('verified_saving');
    expect(picks[0].saving).toEqual({ status: 'verified', amount: 8, percent: 20, reference: 40 });
    expect(picks[0].reasons).toContain('Su precio está en el nivel más bajo visto en Aventa en 90 días.');
    expect(html(picks[0])).toContain('Ahorro verificado · $8 menos que su precio más alto en 90 días');
    expect(plan.verifiedCount).toBe(1);
  });

  it('precio anterior inválido: un descuento nominal enorme no sube y no se muestra como ahorro', () => {
    const list = [
      offer({ id: 'normal', title: 'Arroz blanco 1 kg', discountPrice: 30 }),
      offer({ id: 'etiqueta', title: 'Arroz blanco 1 kg', discountPrice: 30, originalPrice: 300, votes: { score: -1 } }),
      offer({ id: 'contradicho', title: 'Arroz blanco 1 kg', discountPrice: 30, originalPrice: 300, priceHistory: labelOnlyHistory, votes: { score: 50 } }),
    ];
    const picks = picksOf(buildDespensaPlan(list, { now: NOW }), 'alimentos.arroz');
    expect(pickIds(picks)).toEqual(['normal', 'etiqueta', 'contradicho']);
    const byId = Object.fromEntries(picks.map((p) => [p.offer.id, p]));
    expect(byId.etiqueta.saving).toEqual({ status: 'list_unconfirmed' });
    expect(byId.contradicho.saving).toEqual({ status: 'list_contradicted' });
    expect(byId.contradicho.notes).toContain('list_contradicted');
    for (const p of picks) {
      expect(p.status).toBe('observed_price');
      expect(html(p)).not.toMatch(/\$270|90%|ahorr/i);
    }
  });

  it('precio desactualizado: no se recomienda y se cuenta aparte', () => {
    const plan = buildDespensaPlan(
      [offer({ id: 'viejo', title: 'Arroz blanco 1 kg', createdAt: hoursAgo(24 * 8) }), offer({ id: 'nuevo', title: 'Frijol negro 900 g' })],
      { now: NOW },
    );
    expect(picksOf(plan, 'alimentos.arroz')).toEqual([]);
    expect(plan.staleCount).toBe(1);
    expect(plan.referenceGaps.map((g) => g.label)).toContain('Arroz en grano');
  });

  it('disponibilidad no confirmada sin vigencia; confirmada con vigencia futura', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'sin', title: 'Arroz blanco 1 kg' }),
        offer({ id: 'con', title: 'Frijol negro 900 g', expiresAt: hoursAgo(-48) }),
      ],
      { now: NOW },
    );
    expect(picksOf(plan, 'alimentos.arroz')[0].notes).toContain('availability_unconfirmed');
    const frijol = picksOf(plan, 'alimentos.frijol')[0];
    expect(frijol.notes).not.toContain('availability_unconfirmed');
    expect(frijol.reasons[0]).toBe('La tienda publica el precio y hasta cuándo es válido.');
  });

  it('distingue precio en línea, de sucursal y no localizado', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'online', title: 'Arroz blanco 1 kg', offerScope: 'online' }),
        offer({ id: 'tienda', title: 'Frijol negro 900 g', offerScope: 'in_store' }),
        offer({ id: 'nd', title: 'Aceite vegetal 1 L', offerScope: null }),
      ],
      { now: NOW },
    );
    expect(picksOf(plan, 'alimentos.arroz')[0].notes).toContain('zone_unconfirmed');
    expect(picksOf(plan, 'alimentos.frijol')[0].notes).toContain('branch_unconfirmed');
    expect(picksOf(plan, 'alimentos.aceite')[0].notes).toContain('location_unknown');
  });

  it('precio sin tienda identificable: información insuficiente', () => {
    const plan = buildDespensaPlan([offer({ id: 'r', title: 'Arroz blanco 1 kg', sourceHost: 'tiendita-local.mx' })], { now: NOW });
    expect(picksOf(plan, 'alimentos.arroz')[0].status).toBe('reported_price');
  });

  it('sin ofertas verificadas: el plan sigue funcionando y lo dice', () => {
    const plan = buildDespensaPlan([offer({ id: 'a', title: 'Arroz blanco 1 kg' })], { now: NOW });
    expect(plan.verifiedCount).toBe(0);
    expect(plan.needs).toHaveLength(1);
  });

  it('sin ofertas: todo queda como referencia de la canasta', () => {
    const plan = buildDespensaPlan([], { now: NOW });
    expect(plan.needs).toEqual([]);
    expect(plan.referenceGaps).toHaveLength(24);
  });
});

describe('presentaciones y categorías', () => {
  it('presentaciones distintas se comparan por litro y gana la más barata por unidad', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'chico', title: 'Aceite vegetal 1 L', discountPrice: 40 }),
        offer({ id: 'grande', title: 'Aceite vegetal 3 L', discountPrice: 105 }),
      ],
      { now: NOW },
    );
    const picks = picksOf(plan, 'alimentos.aceite');
    expect(pickIds(picks)).toEqual(['grande', 'chico']);
    expect(picks[0].unitPrice).toEqual({ dimension: 'volume', value: 35, per: 'l' });
    expect(picks[0].cheapestPerUnit).toBe(true);
    expect(picks[0].unitPeers).toBe(2);
    expect(picks[0].reasons.join(' ')).toContain('Por litro, está en la mitad más barata de 2 opciones comparables.');
    expect(picks[1].cheapestPerUnit).toBe(false);
  });

  it('no compara variantes distintas por unidad', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'blanco', title: 'Arroz blanco 1 kg', discountPrice: 30 }),
        offer({ id: 'integral', title: 'Arroz integral 1 kg', discountPrice: 60 }),
      ],
      { now: NOW },
    );
    for (const p of picksOf(plan, 'alimentos.arroz')) {
      expect(p.unitPeers).toBe(1);
      expect(p.cheapestPerUnit).toBe(false);
    }
  });

  it('varias categorías quedan en sus pasillos; esenciales e intereses primero', () => {
    const plan = buildDespensaPlan(
      [
        offer({ id: 'perro', title: 'Croquetas alimento para perro 4 kg', discountPrice: 300 }),
        offer({ id: 'arroz', title: 'Arroz blanco 1 kg' }),
        offer({ id: 'jabon', title: 'Jabón de tocador 3 barras' }),
      ],
      { now: NOW, preferredNeedIds: new Set(['mascotas.alimento_perro']) },
    );
    const aisles = Object.fromEntries(plan.needs.map((n) => [n.need.id, n.aisle]));
    expect(aisles).toMatchObject({ 'alimentos.arroz': 'cereales', 'mascotas.alimento_perro': 'mascotas' });
    expect(plan.needs[0].need.id).toBe('mascotas.alimento_perro');
    expect(plan.needs[0].picks[0].reasons).toContain('Lo marcaste en tus intereses.');
    expect(despensaAisleFor('higiene.jabon')).toBe('higiene');
  });

  it('es determinista con la entrada en cualquier orden', () => {
    const list = [
      offer({ id: 'a', title: 'Arroz blanco 1 kg', discountPrice: 30 }),
      offer({ id: 'b', title: 'Arroz blanco 2 kg', discountPrice: 55 }),
      offer({ id: 'c', title: 'Aceite vegetal 1 L' }),
    ];
    const once = buildDespensaPlan(list, { now: NOW }).needs.map((n) => [n.need.id, pickIds(n.picks)]);
    const reversed = buildDespensaPlan([...list].reverse(), { now: NOW }).needs.map((n) => [n.need.id, pickIds(n.picks)]);
    expect(once).toEqual(reversed);
    expect(buildDespensaPlan(list, { now: NOW }).rulesVersion).toBe(DESPENSA_RANK_RULES.version);
  });
});

describe('ranking v3 (feed sin historial)', () => {
  it('sin historial la clave de ahorro empata: el precio de lista no ayuda', () => {
    const list = [
      { id: 'lista', title: 'Arroz blanco 1 kg', discountPrice: 30, originalPrice: 500, votes: { score: 0 }, createdAt: hoursAgo(1), sourceHost: 'walmart.com.mx' },
      { id: 'votada', title: 'Arroz blanco 1 kg', discountPrice: 30, originalPrice: null, votes: { score: 1 }, createdAt: hoursAgo(1), sourceHost: 'walmart.com.mx' },
    ];
    expect(rankDespensa(list, { now: NOW }).ranked.map((o) => o.id)).toEqual(['votada', 'lista']);
    expect(DESPENSA_RANK_RULES.version).toBe('despensa-rank-v3');
  });
});

describe('lista y gasto estimado', () => {
  it('suma con los precios vistos y compara con el presupuesto declarado', () => {
    const items = [{ price: 30.5 }, { price: 420 }, { price: 99.5 }];
    expect(estimateDespensaList(items, budget('weekly', 'low'))).toEqual({
      totalMxn: 550,
      count: 3,
      budgetMxn: 500,
      horizon: 'weekly',
      remainingMxn: -50,
      sharePct: 110,
    });
    expect(estimateDespensaList(items, null)).toMatchObject({ totalMxn: 550, budgetMxn: null, remainingMxn: null, sharePct: null });
    expect(estimateDespensaList([], budget('monthly', 'medium'))).toMatchObject({ totalMxn: 0, remainingMxn: 4000, sharePct: 0 });
  });

  it('la lista guardada descarta entradas inválidas y duplicadas', () => {
    const parsed = parseDespensaList([
      { id: 'a', title: 'Arroz', price: 30, needId: 'alimentos.arroz', addedAt: UPDATED },
      { id: 'a', title: 'Arroz otra vez', price: 31 },
      { id: 'b', title: 'Sin precio', price: 0 },
      { id: 'c', title: 'Precio texto', price: '20' },
      { id: 'e', title: 'Infinito', price: Infinity },
      null,
      'basura',
      { id: 'd', title: 'Frijol', price: 38 },
    ]);
    expect(parsed.map((i) => i.id)).toEqual(['a', 'd']);
    expect(parsed[1]).toEqual({ id: 'd', title: 'Frijol', price: 38, needId: null, addedAt: '' });
    expect(parseDespensaList({ not: 'array' })).toEqual([]);
    const many = Array.from({ length: DESPENSA_LIST_MAX_ITEMS + 5 }, (_, i) => ({ id: `x${i}`, title: 't', price: 1 }));
    expect(parseDespensaList(many)).toHaveLength(DESPENSA_LIST_MAX_ITEMS);
  });
});
