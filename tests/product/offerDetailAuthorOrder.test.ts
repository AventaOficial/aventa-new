import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

function indexesInOrder(source: string, markers: string[]): number[] {
  return markers.map((m) => source.indexOf(m));
}

describe('orden del detalle de oferta', () => {
  const page = readFileSync('app/oferta/[id]/OfferPageContent.tsx', 'utf8');
  const modal = readFileSync('app/components/OfferModal.tsx', 'utf8');

  it('página: galería, título, precio, Descripción del cazador, comentarios, Información adicional, autor', () => {
    const idx = indexesInOrder(page, [
      '<OfferImageThumbs',
      '<h1',
      'presentOfferPrice(offer.discountPrice',
      'Descripción del cazador',
      'id="comentarios"',
      'Información adicional',
      'aria-label="Ficha del autor"',
    ]);
    for (const i of idx) expect(i).toBeGreaterThan(-1);
    for (let k = 1; k < idx.length; k++) expect(idx[k]).toBeGreaterThan(idx[k - 1]);
  });

  it('página: la ficha del autor aparece una sola vez y es el último bloque del artículo', () => {
    expect(page.match(/<OfferAuthorCard/g)?.length ?? 0).toBe(1);
    const authorIdx = page.indexOf('aria-label="Ficha del autor"');
    const articleEnd = page.indexOf('</article>');
    const between = page.slice(authorIdx, articleEnd);
    expect(between).not.toMatch(/<(details|h2)\b/);
  });

  it('página: las condiciones viven dentro de Información adicional', () => {
    const infoIdx = page.indexOf('Información adicional');
    const conditionsIdx = page.indexOf('<OfferConditionsBlock');
    const authorIdx = page.indexOf('aria-label="Ficha del autor"');
    expect(page.match(/<OfferConditionsBlock/g)?.length ?? 0).toBe(1);
    expect(conditionsIdx).toBeGreaterThan(infoIdx);
    expect(conditionsIdx).toBeLessThan(authorIdx);
  });

  it('modal: la ficha del autor aparece una sola vez, después de comentarios', () => {
    expect(modal.match(/<OfferAuthorCard/g)?.length ?? 0).toBe(1);
    const commentsIdx = modal.indexOf('Comentarios ({comments.length})');
    const infoIdx = modal.indexOf('Información adicional');
    const authorIdx = modal.indexOf('aria-label="Ficha del autor"');
    expect(authorIdx).toBeGreaterThan(commentsIdx);
    expect(authorIdx).toBeGreaterThan(infoIdx);
  });
});
