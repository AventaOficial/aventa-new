import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brandedTitle } from '@/lib/seo/brandedTitle';

describe('layout metadataBase', () => {
  it('never resolves canonical or og:url against the deployment URL', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/VERCEL_URL/);
    expect(layout).toMatch(/process\.env\.NEXT_PUBLIC_APP_URL \|\| "https:\/\/aventaofertas\.com"/);
    expect(layout).toMatch(/metadataBase: new URL\(baseUrl\)/);
  });
});

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
