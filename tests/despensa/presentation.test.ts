import { describe, expect, it } from 'vitest';
import { compareUnitPrices, parsePresentation, unitPriceFor } from '@/lib/despensa/presentation';

describe('presentación', () => {
  it('lee masa, volumen y conteo con su unidad base', () => {
    expect(parsePresentation('Arroz Verde Valle 1 kg')).toMatchObject({ dimension: 'mass', totalBase: 1000 });
    expect(parsePresentation('Aceite 946 ml')).toMatchObject({ dimension: 'volume', totalBase: 946 });
    expect(parsePresentation('Detergente 1.5 L')).toMatchObject({ dimension: 'volume', totalBase: 1500 });
    expect(parsePresentation('Detergente 1,5 L')).toMatchObject({ dimension: 'volume', totalBase: 1500 });
    expect(parsePresentation('Papel higiénico 32 rollos')).toMatchObject({ dimension: 'count', totalBase: 32, countUnit: 'rollo' });
    expect(parsePresentation('Huevo blanco 30 piezas')).toMatchObject({ dimension: 'count', countUnit: 'pieza', totalBase: 30 });
  });

  it('multiplica paquetes explícitos', () => {
    expect(parsePresentation('Leche entera 6 x 1 L')).toMatchObject({ dimension: 'volume', totalBase: 6000 });
    expect(parsePresentation('Atún 4×140 g')).toMatchObject({ dimension: 'mass', totalBase: 560 });
    expect(parsePresentation('Pañales paquete de 3 con 40 pañales')).toMatchObject({ dimension: 'count', totalBase: 120, packs: 3 });
    expect(parsePresentation('Croquetas 1,000 g')).toMatchObject({ dimension: 'mass', totalBase: 1000 });
  });

  it('devuelve null si la lectura es ambigua o no existe', () => {
    expect(parsePresentation('Shampoo 400 ml + acondicionador 200 ml')).toBeNull();
    expect(parsePresentation('Detergente líquido')).toBeNull();
    expect(parsePresentation('')).toBeNull();
    expect(parsePresentation('Pack de 2 o pack de 3 jabones')).toBeNull();
  });
});

describe('precio unitario y comparación', () => {
  it('normaliza por kg, L o pieza', () => {
    expect(unitPriceFor(30, parsePresentation('Arroz 500 g'), ['mass'])).toEqual({ dimension: 'mass', value: 60, per: 'kg' });
    expect(unitPriceFor(90, parsePresentation('Detergente 3 L'), ['volume'])).toEqual({ dimension: 'volume', value: 30, per: 'l' });
    expect(unitPriceFor(160, parsePresentation('Papel 32 rollos'), ['count'])).toEqual({ dimension: 'count', value: 5, per: 'rollo' });
  });

  it('no calcula precio unitario sin precio, sin presentación o con dimensión no válida', () => {
    expect(unitPriceFor(0, parsePresentation('Arroz 1 kg'), ['mass'])).toBeNull();
    expect(unitPriceFor(null, parsePresentation('Arroz 1 kg'), ['mass'])).toBeNull();
    expect(unitPriceFor(20, null, ['mass'])).toBeNull();
    expect(unitPriceFor(20, parsePresentation('Aceite 1 L'), ['mass'])).toBeNull();
  });

  it('compara presentaciones distintas de la misma necesidad', () => {
    const small = { needId: 'alimentos.arroz', unitPrice: unitPriceFor(30, parsePresentation('Arroz 500 g'), ['mass']) };
    const big = { needId: 'alimentos.arroz', unitPrice: unitPriceFor(50, parsePresentation('Arroz 1 kg'), ['mass']) };
    expect(compareUnitPrices(small, big)).toEqual({ comparable: true, cheaper: 'b', ratio: 1.2 });
  });

  it('se niega a comparar lo incompatible', () => {
    const arroz = { needId: 'alimentos.arroz', unitPrice: unitPriceFor(30, parsePresentation('Arroz 1 kg'), ['mass']) };
    const frijol = { needId: 'alimentos.frijol', unitPrice: unitPriceFor(30, parsePresentation('Frijol 1 kg'), ['mass']) };
    const leche = { needId: 'alimentos.leche', unitPrice: unitPriceFor(30, parsePresentation('Leche 1 L'), ['volume', 'mass']) };
    const lechePolvo = { needId: 'alimentos.leche', unitPrice: unitPriceFor(90, parsePresentation('Leche en polvo 800 g'), ['volume', 'mass']) };
    const papelRollos = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(100, parsePresentation('Papel 20 rollos'), ['count']) };
    const papelHojas = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(100, parsePresentation('Papel 400 hojas'), ['count']) };
    expect(compareUnitPrices(arroz, frijol)).toEqual({ comparable: false, reason: 'different_need' });
    expect(compareUnitPrices(leche, lechePolvo)).toEqual({ comparable: false, reason: 'different_dimension' });
    expect(compareUnitPrices(papelRollos, papelHojas)).toEqual({ comparable: false, reason: 'different_count_unit' });
    expect(compareUnitPrices(arroz, { needId: 'alimentos.arroz', unitPrice: null })).toEqual({ comparable: false, reason: 'missing_unit_price' });
  });
});
