import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  budgetFit,
  buildDespensaBudget,
  DESPENSA_BUDGET_PRESETS,
  parseDespensaBudget,
  weeklyEquivalentMxn,
} from '@/lib/despensa/budget';
import {
  DESPENSA_BUDGET_DISMISSED_KEY,
  DESPENSA_BUDGET_LOCAL_KEY,
  DESPENSA_BUDGET_METADATA_KEY,
  persistBudget,
  readBudgetDismissed,
  resolveStoredBudget,
  writeBudgetDismissed,
} from '@/lib/despensa/budgetStore';
import { despensaSignals, rankDespensa } from '@/lib/despensa/rank';
import { processHomeFeedList } from '@/lib/offers/homeFeedClient';
import { interestEventSchema } from '@/lib/interests/schema';
import { DESPENSA_BUDGET_COPY } from '@/lib/despensa/budgetCopy';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const weekly500 = buildDespensaBudget({ horizon: 'weekly', tier: 'low', now: NOW })!;
const monthly8000 = buildDespensaBudget({ horizon: 'monthly', tier: 'high', now: NOW })!;

type Offer = { id: string; title: string; discountPrice: number; votes: { score: number }; createdAt: string; sourceHost: string; upvotes?: number; origin?: 'community' | 'machine' | null };
const offer = (o: Partial<Offer> & Pick<Offer, 'id' | 'title' | 'discountPrice'>): Offer => ({
  votes: { score: 0 },
  createdAt: hoursAgo(1),
  sourceHost: 'walmart.com.mx',
  ...o,
});
const ids = (list: readonly { id?: string | null }[]) => list.map((o) => o.id);

describe('presupuesto: modelo', () => {
  it('ofrece semanal y mensual, con bajo, medio, alto y cantidad propia', () => {
    expect(weekly500).toMatchObject({ v: 1, horizon: 'weekly', tier: 'low', amountMxn: 500 });
    expect(DESPENSA_BUDGET_PRESETS.weekly.low).toBe(500);
    expect(buildDespensaBudget({ horizon: 'monthly', tier: 'custom', amountMxn: 1234.6, now: NOW })?.amountMxn).toBe(1235);
    expect(buildDespensaBudget({ horizon: 'weekly', tier: 'custom', amountMxn: 50, now: NOW })).toBeNull();
    expect(buildDespensaBudget({ horizon: 'weekly', tier: 'custom', amountMxn: null, now: NOW })).toBeNull();
  });

  it('lee solo formas válidas; lo demás es «sin presupuesto»', () => {
    expect(parseDespensaBudget(JSON.parse(JSON.stringify(weekly500)))).toEqual(weekly500);
    expect(parseDespensaBudget({ ...weekly500, amountMxn: -1 })).toBeNull();
    expect(parseDespensaBudget({ ...weekly500, horizon: 'daily' })).toBeNull();
    expect(parseDespensaBudget({ ...weekly500, v: 2 })).toBeNull();
    expect(parseDespensaBudget('500')).toBeNull();
    expect(parseDespensaBudget(null)).toBeNull();
  });

  it('el ajuste usa el equivalente semanal y no juzga a la persona', () => {
    expect(weeklyEquivalentMxn(monthly8000)).toBeCloseTo(1839.9, 0);
    expect(budgetFit(100, weekly500)).toBe('fits');
    expect(budgetFit(126, weekly500)).toBe('over_share');
    expect(budgetFit(null, weekly500)).toBe('unknown_price');
    expect(budgetFit(100, null)).toBe('no_budget');
    const copy = Object.values(DESPENSA_BUDGET_COPY).join(' ').toLowerCase();
    for (const word of ['pobre', 'rico', 'ingreso', 'suficiente', 'familia', 'hogar de']) expect(copy).not.toContain(word);
    expect(DESPENSA_BUDGET_COPY.question).toBe('¿Cuánto presupuesto tienes para tu despensita?');
  });
});

describe('presupuesto en el ranking de Día a día', () => {
  const list = [
    offer({ id: 'arroz-5kg', title: 'Arroz blanco 5 kg', discountPrice: 140 }),
    offer({ id: 'arroz-1kg-caro', title: 'Arroz blanco 1 kg', discountPrice: 36 }),
    offer({ id: 'arroz-900g', title: 'Arroz blanco 900 g', discountPrice: 30 }),
    offer({ id: 'detergente', title: 'Detergente líquido 9 L', discountPrice: 320 }),
    offer({ id: 'papel', title: 'Papel higiénico 4 rollos', discountPrice: 40 }),
    offer({ id: 'audifonos', title: 'Audífonos bluetooth', discountPrice: 299 }),
  ];

  it('nunca oculta ofertas: el presupuesto ordena, no filtra', () => {
    const withBudget = rankDespensa(list, { now: NOW, budget: weekly500 });
    expect(withBudget.ranked).toHaveLength(list.length);
    expect(new Set(ids(withBudget.ranked))).toEqual(new Set(ids(list)));
  });

  it('un paquete grande con mejor precio unitario sigue arriba aunque no quepa en el presupuesto', () => {
    const r = ids(rankDespensa(list, { now: NOW, budget: weekly500 }).ranked);
    expect(r.indexOf('arroz-5kg')).toBeLessThan(r.indexOf('arroz-1kg-caro'));
  });

  it('solo desempata dentro del mismo nivel: lo que cabe sube frente a lo que no', () => {
    const pair = [
      offer({ id: 'grande', title: 'Detergente líquido 9 L', discountPrice: 320, createdAt: hoursAgo(1) }),
      offer({ id: 'chico', title: 'Pasta dental 100 ml', discountPrice: 35, createdAt: hoursAgo(5) }),
    ];
    expect(ids(rankDespensa(pair, { now: NOW }).ranked)).toEqual(['grande', 'chico']);
    expect(ids(rankDespensa(pair, { now: NOW, budget: weekly500 }).ranked)).toEqual(['chico', 'grande']);
    expect(ids(rankDespensa(pair, { now: NOW, budget: monthly8000 }).ranked)).toEqual(['grande', 'chico']);
  });

  it('sin presupuesto el orden es el mismo que antes de esta preferencia', () => {
    expect(ids(rankDespensa(list, { now: NOW, budget: null }).ranked)).toEqual(ids(rankDespensa(list, { now: NOW }).ranked));
  });

  it('no cambia Top, Recientes ni Para ti', () => {
    const feed = list.map((o, i) => ({ ...o, upvotes: i, origin: 'community' as const }));
    for (const view of ['top', 'latest', 'personalized'] as const) {
      expect(processHomeFeedList(feed, view, 12, undefined, undefined, weekly500)).toEqual(processHomeFeedList(feed, view, 12));
    }
  });

  it('un precio de lista en el feed no se vuelve ahorro verificado', () => {
    for (const o of list) expect(despensaSignals(o, { now: NOW, budget: weekly500 }).verifiedSaving).toBe(false);
  });
});

describe('persistencia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage() {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    });
    return data;
  }

  it('sin sesión guarda en el dispositivo; con sesión en la cuenta y borra la copia local', async () => {
    const data = stubStorage();
    await persistBudget(weekly500, { signedIn: false });
    expect(JSON.parse(data.get(DESPENSA_BUDGET_LOCAL_KEY)!)).toEqual(weekly500);
    expect(resolveStoredBudget(null)).toEqual(weekly500);

    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const result = await persistBudget(monthly8000, { signedIn: true, supabase: { auth: { updateUser } } as never });
    expect(result).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ data: { [DESPENSA_BUDGET_METADATA_KEY]: monthly8000 } });
    expect(data.has(DESPENSA_BUDGET_LOCAL_KEY)).toBe(false);
    expect(resolveStoredBudget({ user_metadata: { despensa_budget: monthly8000 } })).toEqual(monthly8000);
  });

  it('con sesión la cuenta manda: no mezcla el presupuesto del dispositivo', () => {
    stubStorage();
    void persistBudget(weekly500, { signedIn: false });
    expect(resolveStoredBudget({ user_metadata: {} })).toBeNull();
  });

  it('se puede quitar, y un error de guardado no cambia nada', async () => {
    stubStorage();
    const updateUser = vi.fn().mockResolvedValue({ error: { message: 'x' } });
    expect(await persistBudget(null, { signedIn: true, supabase: { auth: { updateUser } } as never })).toEqual({ ok: false });
    expect(updateUser).toHaveBeenCalledWith({ data: { [DESPENSA_BUDGET_METADATA_KEY]: null } });
  });

  it('saltar la pregunta se recuerda en el dispositivo y se puede revertir', () => {
    const data = stubStorage();
    expect(readBudgetDismissed()).toBe(false);
    writeBudgetDismissed(true);
    expect(data.get(DESPENSA_BUDGET_DISMISSED_KEY)).toBe('1');
    expect(readBudgetDismissed()).toBe(true);
    writeBudgetDismissed(false);
    expect(readBudgetDismissed()).toBe(false);
  });

  it('sin almacenamiento disponible no falla', async () => {
    expect(await persistBudget(weekly500, { signedIn: false })).toEqual({ ok: true });
    expect(resolveStoredBudget(null)).toBeNull();
  });
});

describe('analítica del presupuesto', () => {
  it('acepta horizonte y nivel, nunca la cantidad', () => {
    expect(interestEventSchema.safeParse({ name: 'interest_saved', kind: 'despensa_budget', horizon: 'weekly', tier: 'low', surface: 'dia_a_dia' }).success).toBe(true);
    expect(interestEventSchema.safeParse({ name: 'interest_removed', kind: 'despensa_budget', surface: 'me_intereses' }).success).toBe(true);
    expect(interestEventSchema.safeParse({ name: 'interest_saved', kind: 'despensa_budget', horizon: 'weekly', tier: 'low', surface: 'dia_a_dia', amountMxn: 500 }).success).toBe(false);
    expect(interestEventSchema.safeParse({ name: 'interest_offer_clicked', offerId: '00000000-0000-4000-8000-000000000000' }).success).toBe(true);
  });
});