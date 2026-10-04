import { describe, expect, it } from 'vitest';
import { brandedTitle } from '@/lib/seo/brandedTitle';

describe('brandedTitle', () => {
  it('adds the brand once', () => {
    expect(brandedTitle('Purina Dog Chow').title).toEqual({
      absolute: 'Purina Dog Chow | AVENTA',
    });
  });

  it('does not double a title that already carries the brand', () => {
    expect(brandedTitle('Purina Dog Chow | AVENTA').title).toEqual({
      absolute: 'Purina Dog Chow | AVENTA',
    });
  });

  it('uses an absolute title so the layout template is skipped', () => {
    const title = brandedTitle('Términos y Condiciones').title;
    expect(title).toEqual({ absolute: 'Términos y Condiciones | AVENTA' });
    expect(typeof title).toBe('object');
  });
});
