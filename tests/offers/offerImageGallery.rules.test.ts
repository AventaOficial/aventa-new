/**
 * Gallery UX rules — +N must open remaining images, not decorate.
 */
import { describe, expect, it } from 'vitest';
import { THUMB_CLEAR_SLOTS } from '@/app/components/OfferImageThumbs';

function overflowLabel(total: number, clearSlots = THUMB_CLEAR_SLOTS): string | null {
  if (total <= 1) return null;
  if (total <= clearSlots) return null;
  return `+${total - clearSlots}`;
}

function openGalleryIndex(total: number, clearSlots = THUMB_CLEAR_SLOTS): number | null {
  if (total <= clearSlots) return null;
  return clearSlots;
}

describe('OfferImageGallery UX rules', () => {
  it('1 imagen → sin +N', () => {
    expect(overflowLabel(1)).toBeNull();
  });

  it('2 imágenes → sin +N', () => {
    expect(overflowLabel(2)).toBeNull();
  });

  it('3 imágenes → sin +N (todos visibles)', () => {
    expect(overflowLabel(3)).toBeNull();
    expect(openGalleryIndex(3)).toBeNull();
  });

  it('6 imágenes → +3 y abre en índice 3 (primera no visible)', () => {
    expect(overflowLabel(6)).toBe('+3');
    expect(openGalleryIndex(6)).toBe(3);
  });

  it('10 imágenes → +7', () => {
    expect(overflowLabel(10)).toBe('+7');
  });

  it('4 imágenes → +1 (3 thumbs claros + overflow)', () => {
    expect(overflowLabel(4)).toBe('+1');
    expect(openGalleryIndex(4)).toBe(3);
  });
});
