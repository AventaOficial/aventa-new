import { describe, expect, it } from 'vitest';
import { compareUnitPrices, parsePresentation, unitPriceFor } from '@/lib/despensa/presentation';
import { approximateSubstitutes, comparableDimensionsFor } from '@/lib/despensa/catalog';
import { classifyDespensaText } from '@/lib/despensa/classify';

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

  it('compara presentaciones distintas de la misma necesidad y variante', () => {
    const small = { needId: 'alimentos.arroz', variantId: 'blanco', unitPrice: unitPriceFor(30, parsePresentation('Arroz 500 g'), ['mass']) };
    const big = { needId: 'alimentos.arroz', variantId: 'blanco', unitPrice: unitPriceFor(50, parsePresentation('Arroz 1 kg'), ['mass']) };
    expect(compareUnitPrices(small, big)).toEqual({ comparable: true, cheaper: 'b', ratio: 1.2 });
    const papel4 = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(40, parsePresentation('Papel higiénico 4 rollos'), ['count']) };
    const papel32 = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(256, parsePresentation('Papel higiénico 32 rollos'), ['count']) };
    expect(compareUnitPrices(papel4, papel32)).toEqual({ comparable: true, cheaper: 'b', ratio: 1.25 });
  });

  it('normaliza kg, g, L y ml a la misma unidad base', () => {
    const kilo = unitPriceFor(48, parsePresentation('Tortilla de maíz 1 kg'), ['mass', 'count']);
    const gramos = unitPriceFor(24, parsePresentation('Tortilla de maíz 500 g'), ['mass', 'count']);
    expect(kilo).toEqual({ dimension: 'mass', value: 48, per: 'kg' });
    expect(gramos).toEqual({ dimension: 'mass', value: 48, per: 'kg' });
    expect(unitPriceFor(45, parsePresentation('Aceite vegetal 946 ml'), ['volume'])).toEqual({ dimension: 'volume', value: 47.57, per: 'l' });
    expect(unitPriceFor(150, parsePresentation('Leche entera 6 x 1 L'), ['volume'])).toEqual({ dimension: 'volume', value: 25, per: 'l' });
  });

  it('se niega a comparar lo incompatible', () => {
    const arroz = { needId: 'alimentos.arroz', variantId: 'blanco', unitPrice: unitPriceFor(30, parsePresentation('Arroz 1 kg'), ['mass']) };
    const frijol = { needId: 'alimentos.frijol', variantId: 'negro', unitPrice: unitPriceFor(30, parsePresentation('Frijol 1 kg'), ['mass']) };
    const leche = { needId: 'alimentos.leche', variantId: 'entera', unitPrice: unitPriceFor(30, parsePresentation('Leche 1 L'), ['volume', 'mass']) };
    const lechePolvo = { needId: 'alimentos.leche', variantId: 'polvo', unitPrice: unitPriceFor(90, parsePresentation('Leche en polvo 800 g'), ['volume', 'mass']) };
    const papelRollos = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(100, parsePresentation('Papel 20 rollos'), ['count']) };
    const papelHojas = { needId: 'higiene.papel_higienico', unitPrice: unitPriceFor(100, parsePresentation('Papel 400 hojas'), ['count']) };
    expect(compareUnitPrices(arroz, frijol)).toEqual({ comparable: false, reason: 'different_need' });
    expect(compareUnitPrices(leche, lechePolvo)).toEqual({ comparable: false, reason: 'different_variant' });
    expect(compareUnitPrices(papelRollos, papelHojas)).toEqual({ comparable: false, reason: 'different_count_unit' });
    expect(compareUnitPrices(arroz, { needId: 'alimentos.arroz', variantId: 'blanco', unitPrice: null })).toEqual({ comparable: false, reason: 'missing_unit_price' });
  });

  it('no compara variantes distintas aunque compartan necesidad y unidad', () => {
    const at = (title: string, price: number) => {
      const hit = classifyDespensaText(title)!;
      return { needId: hit.needId, variantId: hit.variantId, unitPrice: unitPriceFor(price, parsePresentation(title), comparableDimensionsFor(hit.needId, hit.variantId)) };
    };
    expect(compareUnitPrices(at('Tortillas de maíz 1 kg', 25), at('Harina de maíz Maseca 1 kg', 22))).toEqual({ comparable: false, reason: 'different_variant' });
    expect(compareUnitPrices(at('Aceite de oliva 500 ml', 120), at('Aceite vegetal 946 ml', 45))).toEqual({ comparable: false, reason: 'different_variant' });
    expect(compareUnitPrices(at('Atún en agua 140 g', 20), at('Atún en aceite 140 g', 19))).toEqual({ comparable: false, reason: 'different_variant' });
    expect(compareUnitPrices(at('Detergente líquido 5 L', 200), at('Suavizante de telas 5 L', 90))).toEqual({ comparable: false, reason: 'different_variant' });
    expect(compareUnitPrices(at('Arroz 1 kg', 30), at('Arroz blanco 900 g', 28))).toEqual({ comparable: false, reason: 'unknown_variant' });
    expect(compareUnitPrices(at('Aceite vegetal 1 L', 50), at('Aceite vegetal 946 ml', 45))).toMatchObject({ comparable: true });
  });

  it('registra sustituciones aproximadas aparte, sin volverlas equivalencias', () => {
    const subs = approximateSubstitutes('alimentos.aceite', 'vegetal');
    expect(subs.map((s) => s.toVariantId).sort()).toEqual(['canola', 'girasol', 'maiz']);
    expect(approximateSubstitutes('alimentos.aceite', 'oliva')).toEqual([]);
    expect(approximateSubstitutes('alimentos.arroz', 'blanco')).toEqual([]);
  });
});
