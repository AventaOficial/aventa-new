/**
 * Gallery + affiliate disclosure contracts for deploy-ready UX WIP.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Offer detail gallery + affiliate disclosure', () => {
  const page = readFileSync(
    join(process.cwd(), 'app/oferta/[id]/OfferPageContent.tsx'),
    'utf8',
  );
  const modal = readFileSync(join(process.cwd(), 'app/components/OfferModal.tsx'), 'utf8');
  const thumbs = readFileSync(join(process.cwd(), 'app/components/OfferImageThumbs.tsx'), 'utf8');
  const gallery = readFileSync(join(process.cwd(), 'app/components/OfferImageGallery.tsx'), 'utf8');

  it('el detalle amplía solo con el control explícito', () => {
    expect(page).toContain('OfferImageGallery');
    expect(page).toContain('Ampliar imagen');
    expect(page).toContain('selectGalleryImage');
    expect(page).not.toContain('onOpenGallery');
    expect(page).not.toMatch(/AffiliateDisclosure\s+variant=["']badge["']/);
  });

  it('el modal también separa miniatura y visor', () => {
    expect(modal).toContain('OfferImageGallery');
    expect(modal).toContain('Ampliar imagen');
    expect(modal).toContain('selectGalleryImage');
    expect(modal).not.toContain('onOpenGallery');
    expect(modal).not.toMatch(/AffiliateDisclosure\s+variant=["']badge["']/);
  });

  it('las miniaturas no abren la galería y +N revela el resto', () => {
    expect(thumbs).toContain('THUMB_CLEAR_SLOTS');
    expect(thumbs).toContain('revealOverflow');
    expect(thumbs).toContain('galleryOverflowExtra');
    expect(thumbs).toContain('hiddenThumbsAfterViewport');
    expect(thumbs).not.toContain('onOpenGallery');
    expect(thumbs).toContain('aria-pressed');
  });

  it('gallery supports keyboard escape/arrows and image error fallback', () => {
    expect(gallery).toContain('Escape');
    expect(gallery).toContain('ArrowLeft');
    expect(gallery).toContain('ArrowRight');
    expect(gallery).toContain('onError');
    expect(gallery).toContain('No se pudo cargar esta imagen');
  });
});
