import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closeGallery, expandGallery, selectGalleryImage } from '@/lib/offers/galleryView';

describe('galería del detalle', () => {
  it('elegir una miniatura cambia la imagen y no abre el visor', () => {
    expect(selectGalleryImage(2)).toEqual({ index: 2, open: false });
    expect(selectGalleryImage(0)).toEqual({ index: 0, open: false });
  });

  it('ampliar abre la imagen ya elegida y cerrar conserva el índice', () => {
    const selected = selectGalleryImage(1);
    const open = expandGallery(selected);
    expect(open).toEqual({ index: 1, open: true });
    expect(closeGallery(open)).toEqual({ index: 1, open: false });
  });

  it('la interfaz separa la miniatura del control de ampliar y cierra con Escape', () => {
    const thumbs = readFileSync('app/components/OfferImageThumbs.tsx', 'utf8');
    const page = readFileSync('app/oferta/[id]/OfferPageContent.tsx', 'utf8');
    const gallery = readFileSync('app/components/OfferImageGallery.tsx', 'utf8');
    expect(thumbs).toContain('onSelect(i)');
    expect(thumbs).not.toContain('onOpenGallery');
    expect(thumbs).toContain('aria-pressed');
    expect(page).toContain('selectGalleryImage');
    expect(page).toContain('expandGallery');
    expect(page).toContain('Ampliar imagen');
    expect(page).not.toContain('onOpenGallery');
    expect(gallery).toContain('Escape');
    expect(gallery).toContain('Cerrar galería');
    expect(gallery).toContain('overflow = \'hidden\'');
    expect(gallery).toContain('openerRef.current?.focus()');
    expect(gallery).toContain('max-w-full');
  });
});
