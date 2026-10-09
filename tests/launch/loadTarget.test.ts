import { describe, expect, it } from 'vitest';
import { assertIsolatedLoadTarget } from '../../scripts/load-read-profile.mjs';

describe('load read profile', () => {
  it('acepta una preview y rechaza producción', () => {
    const preview = assertIsolatedLoadTarget('https://aventa-preview.vercel.app/api/health');
    expect(preview.hostname).toBe('aventa-preview.vercel.app');
    expect(() => assertIsolatedLoadTarget('https://aventaofertas.com/api/feed/home')).toThrow(/production host/);
    expect(() => assertIsolatedLoadTarget('https://mkgsrpsuvedwwlzmzmzh.supabase.co')).toThrow(/production host/);
    expect(() => assertIsolatedLoadTarget('http://staging.aventaofertas.com')).toThrow(/https required/);
  });
});
