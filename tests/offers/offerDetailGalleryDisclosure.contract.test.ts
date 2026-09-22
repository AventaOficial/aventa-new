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

  it('OfferPageContent wires lightbox (+N / hero)', () => {
    expect(page).toContain('OfferImageGallery');
    expect(page).toContain('onOpenGallery');
    expect(page).toContain('setGalleryOpen(true)');
    expect(page).not.toMatch(/AffiliateDisclosure\s+variant=["']badge["']/);
  });

  it('OfferModal also wires gallery (no decorative +N)', () => {
    expect(modal).toContain('OfferImageGallery');
    expect(modal).toContain('onOpenGallery');
    expect(modal).not.toMatch(/AffiliateDisclosure\s+variant=["']badge["']/);
  });

  it('thumbs overflow opens gallery at first hidden index', () => {
    expect(thumbs).toContain('THUMB_CLEAR_SLOTS');
    expect(thumbs).toContain('onOpenGallery');
  });

  it('gallery supports keyboard escape/arrows and image error fallback', () => {
    expect(gallery).toContain('Escape');
    expect(gallery).toContain('ArrowLeft');
    expect(gallery).toContain('ArrowRight');
    expect(gallery).toContain('onError');
    expect(gallery).toContain('No se pudo cargar esta imagen');
  });
});
