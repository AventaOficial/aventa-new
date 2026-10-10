import { describe, expect, it } from 'vitest';
import { parseControlWrite } from '@/lib/control/schema';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

describe('centro de control', () => {
  it('acepta la presentación del feed dentro de los límites', () => {
    const parsed = parseControlWrite({
      domain: 'feed_presentation',
      recordKey: 'home_vitales',
      payload: { maxSameProduct: 2 },
    });
    expect(parsed.ok).toBe(true);
  });

  it('rechaza un tope fuera de rango y un dominio de dinero', () => {
    expect(parseControlWrite({
      domain: 'feed_presentation',
      recordKey: 'home_vitales',
      payload: { maxSameProduct: 40 },
    }).ok).toBe(false);
    expect(parseControlWrite({
      domain: 'feed_presentation',
      recordKey: 'money_path',
      payload: { maxSameProduct: 2 },
    }).ok).toBe(false);
    expect(parseControlWrite({
      domain: 'feed_presentation',
      recordKey: 'home_vitales',
      payload: { maxSameProduct: 2, freeze: false },
    }).ok).toBe(false);
  });

  it('una campaña pagada activa exige vigencia y no se etiqueta como house', () => {
    const missingWindow = parseControlWrite({
      domain: 'ad_campaign',
      recordKey: 'marca_demo',
      payload: {
        kind: 'paid',
        title: 'Marca',
        description: '',
        destinationUrl: 'https://example.com/oferta',
        startsAt: null,
        endsAt: null,
        status: 'active',
      },
    });
    expect(missingWindow.ok).toBe(false);
  });

  it('no persiste horas de frescura: Día a día ya usa la ventana de una semana', () => {
    expect(parseControlWrite({
      domain: 'feed_presentation',
      recordKey: 'home_vitales',
      payload: { maxSameProduct: 2, freshnessHours: 72 },
    }).ok).toBe(false);
  });

  it('el congelamiento de dinero sigue cerrado con la variable en true', () => {
    const previous = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
    expect(isMoneyPathFrozen()).toBe(true);
    if (previous === undefined) delete process.env.MONEY_PATH_FROZEN;
    else process.env.MONEY_PATH_FROZEN = previous;
  });
});
