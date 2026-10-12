import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logEvent = vi.fn();
vi.mock('@/lib/monitoring/clientLogger', () => ({ logEvent: (...args: unknown[]) => logEvent(...args) }));
vi.mock('next/image', () => ({
  default: (props: { src: string }) => createElement('span', { 'data-next-image': props.src }),
}));

import OfferMedia from '@/app/components/offers/OfferMedia';
import {
  isDirectNoReferrerImageHost,
  isImageElementBroken,
  normalizeOfferImageUrl,
  offerImageHost,
  resolveOfferImageSource,
} from '@/lib/offers/media/offerImageSource';
import {
  OFFER_IMAGE_FAILURE_SAMPLE_RATE,
  OFFER_IMAGE_FAILURE_SOURCE,
  buildOfferImageFailureEvent,
  reportOfferImageFailure,
  resetOfferImageFailureTelemetryForTests,
} from '@/lib/offers/media/imageFailureTelemetry';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const SORIANA =
  'https://www.soriana.com/dw/image/v2/BGBD_PRD/on/demandware.static/-/Sites-soriana-grocery/default/dw1/images/p.jpg?sw=500&amp;sh=500';

describe('resolveOfferImageSource — criterio único tarjeta/detalle', () => {
  it('hosts de remotePatterns pasan por next/image', () => {
    expect(resolveOfferImageSource('https://http2.mlstatic.com/D_NQ_1.webp')).toEqual({
      url: 'https://http2.mlstatic.com/D_NQ_1.webp',
      optimized: true,
    });
    expect(resolveOfferImageSource('/placeholder.png')).toEqual({ url: '/placeholder.png', optimized: true });
  });

  it('otro host https se muestra directo (no optimizado), no se descarta', () => {
    expect(resolveOfferImageSource('https://cdn.tienda-ejemplo.mx/foto.jpg')).toEqual({
      url: 'https://cdn.tienda-ejemplo.mx/foto.jpg',
      optimized: false,
    });
  });

  it('Soriana siempre directo sin optimizador, y con &amp; normalizado', () => {
    expect(isDirectNoReferrerImageHost('www.soriana.com')).toBe(true);
    expect(isDirectNoReferrerImageHost('soriana.com')).toBe(true);
    expect(isDirectNoReferrerImageHost('notsoriana.com')).toBe(false);
    const source = resolveOfferImageSource(SORIANA);
    expect(source?.optimized).toBe(false);
    expect(source?.url).toContain('sw=500&sh=500');
    expect(source?.url).not.toContain('&amp;');
  });

  it('http no permitido, vacío o basura → sin foto', () => {
    expect(resolveOfferImageSource('http://cdn.tienda-ejemplo.mx/foto.jpg')).toBeNull();
    expect(resolveOfferImageSource('')).toBeNull();
    expect(resolveOfferImageSource(null)).toBeNull();
    expect(resolveOfferImageSource('javascript:alert(1)')).toBeNull();
  });

  it('normalizeOfferImageUrl solo toca URLs http(s)', () => {
    expect(normalizeOfferImageUrl('  https://x.mx/a.jpg?a=1&amp;b=2 ')).toBe('https://x.mx/a.jpg?a=1&b=2');
    expect(normalizeOfferImageUrl('/local.png')).toBe('/local.png');
  });

  it('offerImageHost nunca devuelve ruta ni query', () => {
    expect(offerImageHost(SORIANA)).toBe('www.soriana.com');
    expect(offerImageHost('/placeholder.png')).toBe('self');
    expect(offerImageHost('no es url')).toBeNull();
  });
});

describe('FT-01 — fallo antes de hidratar', () => {
  it('complete && naturalWidth === 0 ⇒ rota', () => {
    expect(isImageElementBroken({ complete: true, naturalWidth: 0, currentSrc: 'https://x.mx/a.jpg', src: '' })).toBe(true);
  });

  it('cargando, cargada, sin src o SVG ⇒ no rota', () => {
    expect(isImageElementBroken({ complete: false, naturalWidth: 0, currentSrc: '', src: 'https://x.mx/a.jpg' })).toBe(false);
    expect(isImageElementBroken({ complete: true, naturalWidth: 640, currentSrc: 'https://x.mx/a.jpg', src: '' })).toBe(false);
    expect(isImageElementBroken({ complete: true, naturalWidth: 0, currentSrc: '', src: '' })).toBe(false);
    expect(isImageElementBroken({ complete: true, naturalWidth: 0, currentSrc: 'https://x.mx/logo.svg?v=1', src: '' })).toBe(false);
    expect(isImageElementBroken(null)).toBe(false);
  });

  it('OfferMedia revisa la imagen al montar y aplica el fallback', () => {
    const src = read('app/components/offers/OfferMedia.tsx');
    expect(src).toMatch(/const attachMain = \(node: HTMLImageElement \| null\) => \{\s*if \(isImageElementBroken\(node\)\) markFailed\(\);/);
    expect(src.match(/ref=\{isBackdrop \? undefined : attachMain\}/g)?.length).toBe(2);
    expect(src).toContain('Sin foto');
  });
});

describe('OfferMedia — render', () => {
  it('Soriana se renderiza con <img> no-referrer, no con next/image', () => {
    const html = renderToStaticMarkup(createElement(OfferMedia, { src: SORIANA, alt: 'Leche', sizes: '200px' }));
    expect(html).toMatch(/<img[^>]+referrerpolicy="no-referrer"/i);
    expect(html).not.toContain('data-next-image');
    expect(html).toContain('sw=500&amp;sh=500');
    expect(html).not.toContain('&amp;amp;');
  });

  it('host permitido sigue usando next/image', () => {
    const html = renderToStaticMarkup(
      createElement(OfferMedia, { src: 'https://m.media-amazon.com/images/I/x.jpg', alt: 'x', sizes: '200px' }),
    );
    expect(html).toContain('data-next-image="https://m.media-amazon.com/images/I/x.jpg"');
  });
});

describe('Detalle alineado con la tarjeta', () => {
  const content = read('app/oferta/[id]/OfferPageContent.tsx');

  it('no convierte hosts https externos en placeholder', () => {
    expect(content).not.toContain('isNextImageAllowedSrc(rawCurrentImage)');
    expect(content).toContain("resolveOfferImageSource(rawCurrentImage) ? rawCurrentImage : '/placeholder.png'");
    expect(content).not.toMatch(/remotePatterns/);
  });

  it('next.config no abre hosts arbitrarios', () => {
    const config = read('next.config.ts');
    expect(config).not.toContain('soriana');
    expect(config).not.toMatch(/hostname:\s*'\*\*'/);
  });

  it('telemetría cableada en tarjeta, destacada, detalle, miniaturas y galería', () => {
    expect(read('app/components/OfferCard.tsx')).toContain("telemetry={{ surface: 'card', offerId }}");
    expect(read('app/components/FeaturedOfferCard.tsx')).toContain("telemetry={{ surface: 'featured_card', offerId }}");
    expect(content).toContain("telemetry={{ surface: 'detail', offerId: offer.id }}");
    expect(read('app/components/OfferImageThumbs.tsx')).toContain("telemetry={{ surface: 'detail_thumb', offerId }}");
    const gallery = read('app/components/OfferImageGallery.tsx');
    expect(gallery).toContain("markBroken(safeIndex, 'gallery')");
    expect(gallery).toContain("onError={() => markBroken(i, 'gallery_thumb')}");
    expect(gallery).toContain('data-gallery-thumb-fallback');
  });
});

describe('telemetría de fallos de imagen', () => {
  beforeEach(() => {
    logEvent.mockClear();
    resetOfferImageFailureTelemetryForTests();
  });
  afterEach(() => resetOfferImageFailureTelemetryForTests());

  it('el evento solo lleva host, superficie y oferta (nunca la URL ni la query)', () => {
    const event = buildOfferImageFailureEvent({ src: SORIANA, surface: 'detail', offerId: 'abc' });
    expect(event).toEqual({
      type: 'error',
      source: OFFER_IMAGE_FAILURE_SOURCE,
      metadata: { host: 'www.soriana.com', surface: 'detail', offerId: 'abc' },
    });
    const raw = JSON.stringify(event);
    expect(raw).not.toContain('demandware');
    expect(raw).not.toContain('sw=');
  });

  it('muestreo: por debajo de la tasa se envía, por encima no', () => {
    expect(reportOfferImageFailure({ src: SORIANA, surface: 'card', offerId: '1' }, () => 0)).toBe(true);
    expect(
      reportOfferImageFailure({ src: SORIANA, surface: 'card', offerId: '2' }, () => OFFER_IMAGE_FAILURE_SAMPLE_RATE),
    ).toBe(false);
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it('una sola señal por (superficie, host, oferta) por sesión', () => {
    reportOfferImageFailure({ src: SORIANA, surface: 'card', offerId: '1' }, () => 0);
    reportOfferImageFailure({ src: `${SORIANA}&x=2`, surface: 'card', offerId: '1' }, () => 0);
    expect(logEvent).toHaveBeenCalledTimes(1);
    reportOfferImageFailure({ src: SORIANA, surface: 'detail', offerId: '1' }, () => 0);
    expect(logEvent).toHaveBeenCalledTimes(2);
  });

  it('reutiliza el logger de cliente existente (sin endpoint ni dependencia nueva)', () => {
    const src = read('lib/offers/media/imageFailureTelemetry.ts');
    expect(src).toContain("from '@/lib/monitoring/clientLogger'");
    expect(src).not.toMatch(/fetch\(|sendBeacon|supabase/);
  });
});
