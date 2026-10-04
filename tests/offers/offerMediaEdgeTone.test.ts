import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyEdgePixels } from '@/lib/offers/media/edgeTone';

const SIZE = 16;

function image(pixel: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      data.set(pixel(x, y), (y * SIZE + x) * 4);
    }
  }
  return data;
}

const isEdge = (x: number, y: number) => x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;

describe('classifyEdgePixels', () => {
  it('foto de estudio con fondo blanco → plate con ese color', () => {
    const data = image((x, y) => (isEdge(x, y) ? [252, 252, 250, 255] : [30, 60, 200, 255]));
    expect(classifyEdgePixels(data, SIZE, SIZE)).toEqual({ kind: 'plate', rgb: [252, 252, 250] });
  });

  it('tolera ruido de compresión en el fondo', () => {
    const data = image((x, y) => {
      if (!isEdge(x, y)) return [10, 10, 10, 255];
      const n = (x * 7 + y * 3) % 9;
      return [246 + n, 246 + n, 246 + n, 255];
    });
    expect(classifyEdgePixels(data, SIZE, SIZE).kind).toBe('plate');
  });

  it('fondo negro de estudio también es plate (no se fuerza blanco)', () => {
    const data = image((x, y) => (isEdge(x, y) ? [8, 8, 10, 255] : [220, 220, 220, 255]));
    expect(classifyEdgePixels(data, SIZE, SIZE)).toEqual({ kind: 'plate', rgb: [8, 8, 10] });
  });

  it('PNG transparente → transparent', () => {
    const data = image((x, y) => (isEdge(x, y) ? [0, 0, 0, 0] : [20, 20, 20, 255]));
    expect(classifyEdgePixels(data, SIZE, SIZE)).toEqual({ kind: 'transparent' });
  });

  it('foto con escena (borde variado) → scene', () => {
    const data = image((x, y) => [(x * 16) % 256, (y * 16) % 256, ((x + y) * 8) % 256, 255]);
    expect(classifyEdgePixels(data, SIZE, SIZE)).toEqual({ kind: 'scene' });
  });

  it('producto que toca el borde en parte del marco → scene', () => {
    const data = image((x, y) => (isEdge(x, y) && x < 6 ? [200, 30, 30, 255] : [255, 255, 255, 255]));
    expect(classifyEdgePixels(data, SIZE, SIZE).kind).toBe('scene');
  });

  it('datos insuficientes → scene', () => {
    expect(classifyEdgePixels(new Uint8ClampedArray(4), 1, 1)).toEqual({ kind: 'scene' });
    expect(classifyEdgePixels(new Uint8ClampedArray(8), SIZE, SIZE)).toEqual({ kind: 'scene' });
  });
});

describe('OfferMedia', () => {
  const media = readFileSync(join(process.cwd(), 'app/components/offers/OfferMedia.tsx'), 'utf8');

  it('contain por defecto; cover solo explícito', () => {
    expect(media).toMatch(/fit = 'contain'/);
    expect(media).toContain('object-contain object-center');
  });

  it('usa el borde medido para el fondo y cae al difuminado si no se puede leer', () => {
    expect(media).toContain('readEdgeTone(event.currentTarget)');
    expect(media).toMatch(/blur-xl/);
  });

  it('fallback accesible para imagen inválida o rota', () => {
    expect(media).toContain('isNextImageAllowedSrc');
    expect(media).toContain("role: 'img', 'aria-label': alt");
    expect(media).toContain('const onError = () => setFailedSrc(source?.url ?? null)');
  });

  it('hosts fuera de next/image siguen mostrando la foto si son https', () => {
    expect(media).toMatch(/\^https:\\\/\\\/\/i\.test\(url\)/);
    expect(media).toContain('<img');
  });
});

describe('superficies de producto usan el marco compartido', () => {
  const surfaces = [
    'app/components/OfferCard.tsx',
    'app/components/FeaturedOfferCard.tsx',
    'app/oferta/[id]/OfferPageContent.tsx',
    'app/me/favorites/FavoriteOfferTile.tsx',
    'app/components/profile/PublicProfileView.tsx',
    'app/me/dashboard/HunterOffersPreview.tsx',
  ];

  it.each(surfaces)('%s renderiza <OfferMedia', (file) => {
    expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain('<OfferMedia');
  });

  it('las miniaturas del cazador ya no recortan el producto', () => {
    for (const file of surfaces.slice(4)) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toMatch(/<img src=\{offer\.image\}[^>]*object-cover/);
    }
  });
});
