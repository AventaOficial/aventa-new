import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGAL_CONSENT_VERSION } from '@/lib/legal/constants';
import {
  assertIsolatedDeployment,
  assertIsolatedLoadTarget,
  classifySample,
  resolveLoadProfile,
} from '../../scripts/load-read-profile.mjs';
import { assertSummaryGate, summarizeCases } from '../../e2e/cases.mjs';

describe('load read profile', () => {
  it('acepta una preview y rechaza producción', () => {
    const preview = assertIsolatedLoadTarget('https://aventa-preview.vercel.app/api/health');
    expect(preview.hostname).toBe('aventa-preview.vercel.app');
    expect(() => assertIsolatedLoadTarget('https://aventaofertas.com/api/feed/home')).toThrow(/production host/);
    expect(() => assertIsolatedLoadTarget('https://mkgsrpsuvedwwlzmzmzh.supabase.co')).toThrow(/production host/);
    expect(() => assertIsolatedLoadTarget('http://staging.aventaofertas.com')).toThrow(/https required/);
  });

  it('no trata un 4xx como éxito y limita los perfiles', () => {
    expect(classifySample(200)).toBe('success');
    expect(classifySample(404)).toBe('client_error');
    expect(classifySample(429)).toBe('rate_limited');
    expect(classifySample(503)).toBe('server_error');
    expect(resolveLoadProfile('base')).toMatchObject({ concurrency: 2, durationMs: 8_000 });
    expect(resolveLoadProfile('stress').concurrency).toBeLessThanOrEqual(12);
    expect(() => resolveLoadProfile('million')).toThrow(/unknown profile/);
    expect(() => assertIsolatedDeployment({ health: { resolved_supabase_ref: 'mkgsrpsuvedwwlzmzmzh' } })).toThrow(/production supabase/);
  });
});

describe('e2e summary', () => {
  it('no cuenta un caso omitido como aprobado', () => {
    const summary = summarizeCases([
      { id: 'discover-offers', status: 'skipped' },
      { id: 'open-offer', status: 'passed' },
      { id: 'publish-pending', status: 'failed' },
    ]);
    expect(summary).toEqual({ total: 3, executed: 2, passed: 1, failed: 1, skipped: 1 });
    expect(() => assertSummaryGate(summary)).toThrow(/unexecuted or failed/);
  });

  it('el aprovisionamiento acepta la versión legal vigente', () => {
    const source = readFileSync(join(process.cwd(), 'scripts', 'e2e-provision.mjs'), 'utf8');
    expect(source).toContain(LEGAL_CONSENT_VERSION);
  });
});
