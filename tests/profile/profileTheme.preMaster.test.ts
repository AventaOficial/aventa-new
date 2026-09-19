/**
 * Pre-Master — Profile theme must follow global html.dark strategy.
 * No nested ThemeProvider; no forced local `.dark` scope on /me.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

describe('Pre-Master — Profile theme boundary', () => {
  it('single ThemeProvider only (no second system)', () => {
    const providers = readFileSync(join(ROOT, 'app/providers.tsx'), 'utf8');
    const theme = readFileSync(join(ROOT, 'app/providers/ThemeProvider.tsx'), 'utf8');
    expect(providers).toMatch(/ThemeProvider/);
    expect(theme).toMatch(/document\.documentElement\.classList/);
    expect(theme).toMatch(/aventa-theme/);
    // No next-themes
    expect(theme).not.toMatch(/next-themes/);
    expect(providers).not.toMatch(/next-themes/);
  });

  it('/me does not force nested dark class (root cause of light-mode break)', () => {
    const src = readFileSync(join(ROOT, 'app/me/page.tsx'), 'utf8');
    expect(src).not.toMatch(/['"`]dark bg-\[#050506\]/);
    expect(src).not.toMatch(/Fuerza variantes dark/);
    // Shell is theme-aware via html.dark
    expect(src).toMatch(/bg-\[#F5F5F7\].*dark:bg-\[#0a0a0a\]/);
  });

  it('hunter surfaces use light/dark pairs (not dark-only paint)', () => {
    const me = readFileSync(join(ROOT, 'app/me/page.tsx'), 'utf8');
    expect(me).toMatch(/dark:bg-\[#121214\]|dark:bg-\[#141414\]/);
    expect(me).toMatch(/text-gray-900 dark:text-white/);

    const hunter = readFileSync(join(ROOT, 'app/me/HunterActivitySummary.tsx'), 'utf8');
    expect(hunter).toMatch(/bg-white.*dark:bg-\[#121214\]/);
    expect(hunter).toMatch(/text-gray-900 dark:text-white/);

    const rep = readFileSync(join(ROOT, 'app/components/ReputationBar.tsx'), 'utf8');
    expect(rep).toMatch(/variant === 'hunter'/);
    expect(rep).toMatch(/bg-white\/90.*dark:bg-\[#0e0e10\]\/90|dark:bg-\[#0e0e10\]\/90/);
  });

  it('public /u profile already theme-aware (unchanged contract)', () => {
    const pub = readFileSync(join(ROOT, 'app/u/[username]/page.tsx'), 'utf8');
    expect(pub).toMatch(/dark:bg-/);
    expect(pub).not.toMatch(/['"`]dark bg-\[#/);
  });
});
