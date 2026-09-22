import { describe, expect, it } from 'vitest';
import { isNextImageAllowedSrc } from '@/lib/offers/isNextImageAllowedSrc';

describe('isNextImageAllowedSrc', () => {
  it('allows local paths and configured retail CDNs', () => {
    expect(isNextImageAllowedSrc('/placeholder.png')).toBe(true);
    expect(isNextImageAllowedSrc('https://http2.mlstatic.com/D_NQ_NP_123.jpg')).toBe(true);
    expect(isNextImageAllowedSrc('https://m.media-amazon.com/images/I/abc.jpg')).toBe(true);
    expect(isNextImageAllowedSrc('https://placehold.co/400x300/png')).toBe(true);
  });

  it('rejects unconfigured hosts that would crash next/image', () => {
    expect(isNextImageAllowedSrc('https://example.com/m31b.jpg')).toBe(false);
    expect(isNextImageAllowedSrc('https://evil.cdn.test/x.jpg')).toBe(false);
    expect(isNextImageAllowedSrc('')).toBe(false);
    expect(isNextImageAllowedSrc(null)).toBe(false);
  });
});
