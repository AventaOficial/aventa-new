import { describe, expect, it } from 'vitest';
import {
  assertDistributionDrainAllowed,
  assertStagingTelegramCredentialRef,
  buildDistributionEnvHealth,
  STAGING_TELEGRAM_CREDENTIAL_REF,
} from '@/lib/distribution/cronSafety';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const PROD_URL = 'https://mkgsrpsuvedwwlzmzmzh.supabase.co';

const stagingSurface = {
  NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
  AVENTA_SUPABASE_TARGET: 'staging',
  AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
  AVENTA_DEPLOYMENT_SURFACE: 'staging',
  DISTRIBUTION_ENGINE_ENABLED: 'true',
};

describe('P0-D3.3 Vercel staging isolation guards', () => {
  it('staging env → staging allowed when flag on', () => {
    expect(assertDistributionDrainAllowed(stagingSurface).ok).toBe(true);
  });

  it('production supabase URL → abort even if surface staging', () => {
    const r = assertDistributionDrainAllowed({
      ...stagingSurface,
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/production_supabase_ref_forbidden/);
  });

  it('production target → abort', () => {
    const r = assertDistributionDrainAllowed({
      ...stagingSurface,
      AVENTA_SUPABASE_TARGET: 'production',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/target_not_staging/);
  });

  it('expected ref mismatch → abort', () => {
    const r = assertDistributionDrainAllowed({
      ...stagingSurface,
      AVENTA_EXPECTED_SUPABASE_REF: 'mkgsrpsuvedwwlzmzmzh',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/expected_ref_mismatch/);
  });

  it('VERCEL_ENV=production allowed only on staging surface', () => {
    const ok = assertDistributionDrainAllowed({
      ...stagingSurface,
      VERCEL_ENV: 'production',
    });
    expect(ok.ok).toBe(true);

    const blocked = assertDistributionDrainAllowed({
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      AVENTA_DEPLOYMENT_SURFACE: 'production',
      DISTRIBUTION_ENGINE_ENABLED: 'true',
      VERCEL_ENV: 'production',
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/deployment_surface_not_staging/);
  });

  it('flag OFF → no-op reason', () => {
    const r = assertDistributionDrainAllowed({
      ...stagingSurface,
      DISTRIBUTION_ENGINE_ENABLED: 'false',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('flag_disabled');
  });

  it('Telegram credential_ref must be staging-only name', () => {
    expect(assertStagingTelegramCredentialRef(STAGING_TELEGRAM_CREDENTIAL_REF).ok).toBe(
      true,
    );
    expect(assertStagingTelegramCredentialRef('TELEGRAM_BOT_TOKEN').ok).toBe(false);
    expect(assertStagingTelegramCredentialRef('123456:AAH-fake-token-value').ok).toBe(
      false,
    );
  });

  it('health snapshot never embeds secret-like values', () => {
    const h = buildDistributionEnvHealth({
      ...stagingSurface,
      CRON_SECRET: 'super-secret-cron-value',
      TELEGRAM_BOT_TOKEN_STAGING: '8719812962:AAHfakeTokenShouldNotAppear',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOi.fake.service',
    });
    const raw = JSON.stringify(h);
    expect(raw).not.toContain('super-secret-cron-value');
    expect(raw).not.toContain('AAHfakeTokenShouldNotAppear');
    expect(raw).not.toContain('eyJhbGciOi.fake.service');
    expect(h.cron_secret_configured).toBe(true);
    expect(h.telegram_staging_token_configured).toBe(true);
  });

  it('production vercel.json still omits distribution-drain', () => {
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).not.toMatch(/distribution-drain/);
  });

  it('staging vercel example registers drain only for staging project', () => {
    const ex = readFileSync(
      join(process.cwd(), 'docs/vercel/aventa-staging.vercel.json.example'),
      'utf8',
    );
    expect(ex).toMatch(/distribution-drain/);
    expect(ex).toMatch(/aventa-staging/);
  });
});
