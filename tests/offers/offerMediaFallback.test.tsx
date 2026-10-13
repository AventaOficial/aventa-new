import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/monitoring/clientLogger', () => ({ logEvent: vi.fn() }));
vi.mock('next/image', () => ({
  default: (props: { src: string }) => createElement('span', { 'data-next-image': props.src }),
}));

import OfferMedia, { advanceOfferMediaFailure, offerMediaAttempts } from '@/app/components/offers/OfferMedia';

const SORIANA_A = 'https://www.soriana.com/dw/image/v2/BGBD_PRD/a.jpg?sw=445&amp;sh=445';
const SORIANA_A_DECODED = SORIANA_A.replace(/&amp;/g, '&');
const SORIANA_B = 'https://www.soriana.com/dw/image/v2/BGBD_PRD/b.jpg?sw=445&sh=445';
const ML = 'https://http2.mlstatic.com/D_NQ_1.webp';

const urls = (src: string | null | undefined, extras?: (string | null | undefined)[] | null) =>
  offerMediaAttempts(src, extras).map((a) => a.url);

describe('orden de intentos de OfferMedia', () => {
  it('sin alternativas: la portada y un reintento', () => {
    expect(urls(SORIANA_B)).toEqual([SORIANA_B, SORIANA_B]);
  });

  it('portada, alternativas distintas y un reintento de la portada', () => {
    expect(urls(SORIANA_A, [SORIANA_A, SORIANA_B, ML])).toEqual([SORIANA_A_DECODED, SORIANA_B, ML, SORIANA_A_DECODED]);
  });

  it('las alternativas se normalizan con el normalizador existente y se deduplican', () => {
    expect(urls(SORIANA_A_DECODED, [SORIANA_A, '//http2.mlstatic.com/D_NQ_1.webp', 'javascript:alert(1)', '', null])).toEqual([
      SORIANA_A_DECODED,
      ML,
      SORIANA_A_DECODED,
    ]);
  });

  it('portada inválida: empieza por la primera alternativa válida', () => {
    expect(urls('ftp://x/a.jpg', [SORIANA_B])).toEqual([SORIANA_B, SORIANA_B]);
  });

  it('sin ninguna URL válida: sin intentos', () => {
    expect(urls(null, null)).toEqual([]);
    expect(urls('', ['javascript:alert(1)'])).toEqual([]);
  });

  it('la portada local se conserva como antes', () => {
    expect(urls('/placeholder.png')[0]).toBe('/placeholder.png');
  });
});

describe('avance ante errores', () => {
  it('recorre todos los intentos y luego queda sin foto', () => {
    const attempts = offerMediaAttempts(SORIANA_A, [SORIANA_B]);
    const key = attempts.map((a) => a.url).join('\n');
    let state = { key, count: 0 };
    const shown: (string | null)[] = [];
    for (let i = 0; i <= attempts.length; i++) {
      shown.push(attempts[state.count]?.url ?? null);
      state = advanceOfferMediaFailure(state, key, state.count);
    }
    expect(shown).toEqual([SORIANA_A_DECODED, SORIANA_B, SORIANA_A_DECODED, null]);
  });

  it('un error repetido del mismo intento no salta dos fotos', () => {
    const s1 = advanceOfferMediaFailure({ key: 'k', count: 0 }, 'k', 0);
    expect(advanceOfferMediaFailure(s1, 'k', 0)).toBe(s1);
  });

  it('si cambian las fotos de la oferta, el conteo empieza de cero', () => {
    expect(advanceOfferMediaFailure({ key: 'viejo', count: 2 }, 'nuevo', 0)).toEqual({ key: 'nuevo', count: 1 });
  });
});

describe('render del servidor', () => {
  const html = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(OfferMedia, { alt: 'Ariel', sizes: '200px', ...props } as never));

  it('el servidor pinta la portada, igual que antes, aunque haya alternativas', () => {
    const out = html({ src: SORIANA_B, fallbackSrcs: [ML] });
    expect(out).toContain(`src="${SORIANA_B.replace(/&/g, '&amp;')}"`);
    expect(out).not.toContain(ML);
    expect(out).not.toContain('Sin foto');
  });

  it('sin fotos válidas: «Sin foto» sin intentar cargar nada', () => {
    const out = html({ src: null, fallbackSrcs: ['javascript:alert(1)'] });
    expect(out).toContain('Sin foto');
    expect(out).not.toContain('<img');
  });

  it('la política de Referer de Soriana no cambia en esta PR', () => {
    const src = readFileSync(join(process.cwd(), 'lib/offers/media/offerImageSource.ts'), 'utf8');
    expect(src).toContain("const DIRECT_NO_REFERRER_HOST_SUFFIXES = ['soriana.com'] as const;");
  });
});

describe('las tarjetas del feed pasan las fotos alternativas', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it.each([
    ['app/components/OfferCard.tsx', 'fallbackSrcs={imageUrls}'],
    ['app/components/FeaturedOfferCard.tsx', 'fallbackSrcs={imageUrls}'],
    ['app/tienda/[slug]/TiendaOfferList.tsx', 'imageUrls={offer.imageUrls}'],
    ['app/categoria/[slug]/CategoriaOfferList.tsx', 'imageUrls={offer.imageUrls}'],
  ])('%s', (file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it('el feed principal las pasa a la tarjeta normal y a la destacada', () => {
    expect(read('app/page.tsx').match(/imageUrls=\{offer\.imageUrls\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
