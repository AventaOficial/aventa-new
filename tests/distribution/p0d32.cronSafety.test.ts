import { describe, expect, it } from 'vitest';
import { assertDistributionDrainAllowed } from '@/lib/distribution/cronSafety';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const PROD_URL = 'https://mkgsrpsuvedwwlzmzmzh.supabase.co';

describe('P0-D3.2 distribution drain cron safety', () => {
  it('aborts when Supabase URL is production', () => {
    const r = assertDistributionDrainAllowed({
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      DISTRIBUTION_ENGINE_ENABLED: 'true',
      VERCEL_ENV: 'preview',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/production_supabase_ref_forbidden/);
  });

  it('aborts on aventa-new-like production surface even with staging URL', () => {
    const r = assertDistributionDrainAllowed({
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      AVENTA_DEPLOYMENT_SURFACE: 'production',
      DISTRIBUTION_ENGINE_ENABLED: 'true',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/deployment_surface_not_staging/);
  });

  it('skips when flag disabled on staging surface', () => {
    const r = assertDistributionDrainAllowed({
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      DISTRIBUTION_ENGINE_ENABLED: 'false',
      VERCEL_ENV: '',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('flag_disabled');
  });

  it('allows dedicated staging surface when flag on', () => {
    const r = assertDistributionDrainAllowed({
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      DISTRIBUTION_ENGINE_ENABLED: 'true',
      VERCEL_ENV: 'production',
    });
    expect(r.ok).toBe(true);
  });

  it('distribution-drain still absent from production vercel.json', () => {
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).not.toMatch(/distribution-drain/);
  });

  it('route imports assertDistributionDrainAllowed and requireCronSecret', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/cron/distribution-drain/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/requireCronSecret/);
    expect(src).toMatch(/assertDistributionDrainAllowed/);
  });
});
