import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OfferImageThumbs, {
  hiddenThumbsAfterViewport,
  overflowTarget,
} from '@/app/components/OfferImageThumbs';

const THUMB = 56;
const GAP = 6;
const edgesFor = (n: number) => Array.from({ length: n }, (_, i) => i * (THUMB + GAP) + THUMB);
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://http2.mlstatic.com/img-${i}.jpg`);

describe('carrusel de miniaturas', () => {
  it('+N cuenta las miniaturas que no caben en el carrusel', () => {
    // 8 fotos en 200px: caben 3 completas (0..2), quedan 5 ocultas.
    expect(hiddenThumbsAfterViewport(edgesFor(8), 200)).toEqual({ firstHidden: 3, count: 5 });
  });

  it('sin +N cuando todas caben', () => {
    expect(hiddenThumbsAfterViewport(edgesFor(3), 200)).toBeNull();
  });

  it('+N se actualiza al desplazar el carrusel', () => {
    const edges = edgesFor(8);
    // desplazado 248px: visibles hasta el borde 448 → ocultas desde índice 7.
    expect(hiddenThumbsAfterViewport(edges, 248 + 200)).toEqual({ firstHidden: 7, count: 1 });
    expect(hiddenThumbsAfterViewport(edges, 500)).toBeNull();
  });

  it('activar +N selecciona la primera foto oculta', () => {
    expect(overflowTarget({ firstHidden: 3, count: 5 }, 0, 8)).toBe(3);
  });

  it('activar +N repetidamente avanza por las fotos restantes hasta la última', () => {
    const seen: number[] = [];
    let active = 0;
    for (let k = 0; k < 6; k++) {
      active = overflowTarget({ firstHidden: 3, count: 5 }, active, 8);
      seen.push(active);
    }
    expect(seen).toEqual([3, 4, 5, 6, 7, 3]);
  });

  it('renderiza todas las imágenes como miniaturas seleccionables, sin duplicar ni alterar URL', () => {
    const images = urls(8);
    const html = renderToStaticMarkup(
      createElement(OfferImageThumbs, { images, activeIndex: 0, onSelect: () => {} }),
    );
    for (let i = 0; i < images.length; i++) {
      expect(html).toContain(`aria-label="Foto ${i + 1} de 8"`);
    }
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html).toContain('data-gallery-overflow');
    expect(html).toContain('aria-label="Ver 5 fotos más"');
    expect(html).toContain('touch-pan-y');
    expect(html).toContain('overflow-x-auto');
  });

  it('una sola imagen: sin miniaturas ni controles', () => {
    const html = renderToStaticMarkup(
      createElement(OfferImageThumbs, { images: urls(1), activeIndex: 0, onSelect: () => {} }),
    );
    expect(html).toBe('');
  });

  it('miniaturas usan OfferMedia con fallback si la imagen falla', () => {
    const html = renderToStaticMarkup(
      createElement(OfferImageThumbs, { images: urls(2), activeIndex: 1, onSelect: () => {} }),
    );
    expect(html).toContain('data-offer-media');
    expect(html).not.toContain('data-gallery-overflow');
  });
});
