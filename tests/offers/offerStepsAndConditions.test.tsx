import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseOfferSteps } from '@/lib/offers/offerSteps';
import OfferStepsList from '@/app/components/offers/OfferStepsList';
import OfferConditionsBlock from '@/app/components/offers/OfferConditionsBlock';

describe('parseOfferSteps', () => {
  it('lee un arreglo JSON y descarta vacíos y no-textos', () => {
    expect(parseOfferSteps('["Agrega al carrito", "  ", 3, " Aplica el cupón "]')).toEqual([
      'Agrega al carrito',
      'Aplica el cupón',
    ]);
  });

  it('lee un paso por línea en texto plano', () => {
    expect(parseOfferSteps('Agrega al carrito\n\n  Paga con tarjeta  \n')).toEqual(['Agrega al carrito', 'Paga con tarjeta']);
  });

  it('un JSON que no es arreglo se trata como texto', () => {
    expect(parseOfferSteps('{"a":1}')).toEqual(['{"a":1}']);
  });

  it('vacío o nulo no da pasos', () => {
    expect(parseOfferSteps('')).toEqual([]);
    expect(parseOfferSteps('   ')).toEqual([]);
    expect(parseOfferSteps(null)).toEqual([]);
    expect(parseOfferSteps(undefined)).toEqual([]);
  });
});

describe('OfferStepsList', () => {
  it('numera cada paso en un círculo morado', () => {
    const html = renderToStaticMarkup(createElement(OfferStepsList, { steps: '["Agrega al carrito","Aplica el cupón"]' }));
    expect(html).toContain('<ol');
    expect(html.match(/rounded-full bg-violet-600/g)).toHaveLength(2);
    expect(html).toMatch(/>1<\/span>.*Agrega al carrito/);
    expect(html).toMatch(/>2<\/span>.*Aplica el cupón/);
  });

  it('sin pasos no pinta nada', () => {
    expect(renderToStaticMarkup(createElement(OfferStepsList, { steps: '  ' }))).toBe('');
  });
});

describe('OfferConditionsBlock', () => {
  it('muestra las condiciones con su icono', () => {
    const html = renderToStaticMarkup(createElement(OfferConditionsBlock, { conditions: ' Solo en línea ' }));
    expect(html).toContain('Condiciones');
    expect(html).toContain('<svg');
    expect(html).toContain('Solo en línea');
  });

  it('sin condiciones no pinta nada', () => {
    expect(renderToStaticMarkup(createElement(OfferConditionsBlock, { conditions: null }))).toBe('');
  });
});
