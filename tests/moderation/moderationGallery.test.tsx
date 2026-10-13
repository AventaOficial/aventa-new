import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ModerationImageGallery from '@/app/admin/components/ModerationImageGallery';
import {
  clampGalleryIndex,
  coverSelectionPayload,
  indexAfterImageFailure,
  stepGalleryIndex,
  workingGalleryImages,
} from '@/lib/moderation/galleryNavigation';
import { OFFER_MAX_IMAGES } from '@/lib/contracts/offers';

const A = 'https://http2.mlstatic.com/a.jpg';
const B = 'https://http2.mlstatic.com/b.jpg';
const C = 'https://http2.mlstatic.com/c.jpg';

describe('galleryNavigation', () => {
  it('stepGalleryIndex es circular en ambos sentidos', () => {
    expect(stepGalleryIndex(0, 3, -1)).toBe(2);
    expect(stepGalleryIndex(2, 3, 1)).toBe(0);
    expect(stepGalleryIndex(1, 3, 1)).toBe(2);
    expect(stepGalleryIndex(0, 1, 1)).toBe(0);
    expect(stepGalleryIndex(0, 0, 1)).toBe(0);
  });

  it('clampGalleryIndex mantiene el índice en rango', () => {
    expect(clampGalleryIndex(5, 3)).toBe(2);
    expect(clampGalleryIndex(-1, 3)).toBe(0);
    expect(clampGalleryIndex(Number.NaN, 3)).toBe(0);
    expect(clampGalleryIndex(2, 0)).toBe(0);
  });

  it('una foto rota se salta sin ocultar las demás', () => {
    expect(workingGalleryImages([A, B, C], new Set([B]))).toEqual([A, C]);
    // Falla la portada estando en ella → se muestra la siguiente (ahora índice 0).
    expect(indexAfterImageFailure([A, B, C], new Set(), A)).toBe(0);
    // Falla la del medio → la siguiente queda en la misma posición.
    expect(indexAfterImageFailure([A, B, C], new Set(), B)).toBe(1);
    // Falla la última → queda la anterior.
    expect(indexAfterImageFailure([A, B, C], new Set(), C)).toBe(1);
    // Ya había rotas: posición relativa a las que seguían sirviendo.
    expect(indexAfterImageFailure([A, B, C], new Set([A]), C)).toBe(0);
  });

  it('si fallan todas devuelve -1 (el padre muestra "Sin foto")', () => {
    expect(indexAfterImageFailure([A], new Set(), A)).toBe(-1);
    expect(indexAfterImageFailure([A, B], new Set([A]), B)).toBe(-1);
  });

  it('coverSelectionPayload pone la elegida primero y conserva el orden del resto', () => {
    expect(coverSelectionPayload([A, B, C], C)).toEqual({ image_url: C, image_urls: [A, B] });
    expect(coverSelectionPayload([A, B, C], B)).toEqual({ image_url: B, image_urls: [A, C] });
  });

  it('coverSelectionPayload no hace nada si ya es portada o no está en la galería', () => {
    expect(coverSelectionPayload([A, B], A)).toBeNull();
    expect(coverSelectionPayload([A, B], 'https://otra.com/x.jpg')).toBeNull();
    expect(coverSelectionPayload([], A)).toBeNull();
  });

  it('coverSelectionPayload respeta el máximo de imágenes', () => {
    const many = Array.from({ length: OFFER_MAX_IMAGES + 3 }, (_, i) => `https://x.com/${i}.jpg`);
    const payload = coverSelectionPayload(many, many[5]);
    expect(payload?.image_url).toBe(many[5]);
    expect(1 + (payload?.image_urls.length ?? 0)).toBe(OFFER_MAX_IMAGES);
    expect(payload?.image_urls).not.toContain(many[5]);
  });
});

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(ModerationImageGallery, {
      images: [A, B, C],
      index: 0,
      onIndexChange: () => {},
      heroBg: 'bg-x',
      ...props,
    } as never)
  );
}

describe('ModerationImageGallery (render)', () => {
  it('muestra contador, flechas y todas las miniaturas', () => {
    const html = render({ index: 1 });
    expect(html).toContain('2/3');
    expect(html).toContain('aria-label="Imagen anterior"');
    expect(html).toContain('aria-label="Siguiente imagen"');
    expect(html).toContain(`src="${B}"`);
    expect(html.match(/aria-label="Ver foto \d"/g)).toHaveLength(3);
    expect(html).toContain('aria-roledescription="carrusel"');
  });

  it('índice fuera de rango se acota', () => {
    expect(render({ index: 9 })).toContain('3/3');
  });

  it('una sola foto: sin flechas ni contador', () => {
    const html = render({ images: [A] });
    expect(html).not.toContain('Imagen anterior');
    expect(html).not.toContain('1/1');
  });

  it('sin fotos no renderiza nada', () => {
    expect(render({ images: [] })).toBe('');
  });

  it('"Usar como portada" solo en fotos que no son portada y solo si hay handler', () => {
    expect(render({ index: 1, onSetCover: () => {} })).toContain('Usar como portada');
    expect(render({ index: 0, onSetCover: () => {} })).not.toContain('Usar como portada');
    expect(render({ index: 1 })).not.toContain('Usar como portada');
    expect(render({ index: 1, onSetCover: () => {}, coverSaving: true })).toContain('Guardando…');
  });

  it('marca la portada en el hero cuando está activa', () => {
    expect(render({ index: 0 })).toMatch(/Portada/);
  });
});
