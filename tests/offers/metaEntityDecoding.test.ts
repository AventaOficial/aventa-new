import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeHtmlAttributeEntities,
  extractOfferMetaImages,
  getAllMetaContents,
  getMetaContent,
} from '@/lib/offers/parseOfferPageHtml';

const SORIANA_IMG =
  'https://www.soriana.com/dw/image/v2/BGBD_PRD/on/demandware.static/-/Sites-soriana-grocery/default/dw1/images/p.jpg?sw=500&amp;sh=500';

describe('decodeHtmlAttributeEntities', () => {
  it('decodifica nombradas y numéricas', () => {
    expect(decodeHtmlAttributeEntities('a&amp;b')).toBe('a&b');
    expect(decodeHtmlAttributeEntities('&quot;hola&quot;')).toBe('"hola"');
    expect(decodeHtmlAttributeEntities('l&#39;oreal')).toBe("l'oreal");
    expect(decodeHtmlAttributeEntities('l&apos;oreal')).toBe("l'oreal");
    expect(decodeHtmlAttributeEntities('caf&#xE9; &#233;')).toBe('café é');
  });

  it('una sola pasada: &amp;amp; → &amp; (no doble decodificación)', () => {
    expect(decodeHtmlAttributeEntities('a&amp;amp;b')).toBe('a&amp;b');
  });

  it('deja intactas entidades desconocidas o inválidas', () => {
    expect(decodeHtmlAttributeEntities('a&foo;b')).toBe('a&foo;b');
    expect(decodeHtmlAttributeEntities('&#0;')).toBe('&#0;');
    expect(decodeHtmlAttributeEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeHtmlAttributeEntities('sin entidades')).toBe('sin entidades');
  });
});

describe('getMetaContent / getAllMetaContents decodifican el valor', () => {
  const html = `<html><head>
    <meta property="og:image" content="${SORIANA_IMG}">
    <meta content="Leche &quot;Lala&quot; 1&#39;L" property="og:title">
  </head></html>`;

  it('og:image de Soriana sale con & real (sin claves amp;sh)', () => {
    const value = getMetaContent(html, 'og:image');
    expect(value).toBe(SORIANA_IMG.replace('&amp;', '&'));
    expect(new URL(value!).searchParams.get('sh')).toBe('500');
    expect(new URL(value!).searchParams.has('amp;sh')).toBe(false);
  });

  it('orden content-primero también decodifica', () => {
    expect(getMetaContent(html, 'og:title')).toBe(`Leche "Lala" 1'L`);
  });

  it('getAllMetaContents y extractOfferMetaImages heredan la decodificación', () => {
    expect(getAllMetaContents(html, 'og:image')).toEqual([SORIANA_IMG.replace('&amp;', '&')]);
    const images = extractOfferMetaImages(html, 'https://www.soriana.com/');
    expect(images[0]).toContain('sw=500&sh=500');
  });

  it('la ingesta de bots usa el mismo decodificador', () => {
    const src = readFileSync(join(process.cwd(), 'lib/bots/ingest/fetchParsedOfferMetadata.ts'), 'utf8');
    expect(src.match(/decodeHtmlAttributeEntities\(/g)?.length).toBe(2);
  });
});
