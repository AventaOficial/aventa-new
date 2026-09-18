import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  assertStagingSupabaseUrl,
  evaluateSupabaseUrlForTarget,
  extractSupabaseProjectRef,
  resolveAventaSupabaseTarget,
} from '@/lib/supabase/projectRefs';

const stagingUrl = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const productionUrl = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

describe('supabase projectRefs isolation', () => {
  it('parses project ref from URL', () => {
    expect(extractSupabaseProjectRef(productionUrl)).toBe(PRODUCTION_SUPABASE_REF);
    expect(extractSupabaseProjectRef(stagingUrl)).toBe(STAGING_SUPABASE_REF);
  });

  it('1) staging + staging ref → PASS', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: stagingUrl,
      target: 'staging',
      env: { AVENTA_EXPECTED_SUPABASE_REF: STAGING_SUPABASE_REF },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ref).toBe(STAGING_SUPABASE_REF);
      expect(r.target).toBe('staging');
    }
  });

  it('2) production + production ref → PASS', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: productionUrl,
      target: 'production',
      env: { AVENTA_SUPABASE_TARGET: 'production' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ref).toBe(PRODUCTION_SUPABASE_REF);
      expect(r.target).toBe('production');
    }
  });

  it('3) staging + production ref → FAIL', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: productionUrl,
      target: 'staging',
      env: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('PRODUCTION');
  });

  it('4) production + staging ref → FAIL', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: stagingUrl,
      target: 'production',
      env: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('production target requires');
      expect(r.error).toContain(PRODUCTION_SUPABASE_REF);
    }
  });

  it('5) target inválido → FAIL', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: stagingUrl,
      env: { AVENTA_SUPABASE_TARGET: 'lab' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid AVENTA_SUPABASE_TARGET/);
    expect(() =>
      resolveAventaSupabaseTarget({ AVENTA_SUPABASE_TARGET: 'lab' }),
    ).toThrow(/invalid AVENTA_SUPABASE_TARGET/);
  });

  it('6) expected ref mismatch → FAIL', () => {
    const r = evaluateSupabaseUrlForTarget({
      url: stagingUrl,
      target: 'staging',
      env: {},
      expectedRef: PRODUCTION_SUPABASE_REF,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/!==.*expected/);
  });

  it('7) ausencia de configuración crítica → FAIL', () => {
    const empty = evaluateSupabaseUrlForTarget({
      url: '',
      target: 'staging',
      env: {},
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toMatch(/cannot parse Supabase project-ref/);

    const missing = evaluateSupabaseUrlForTarget({
      url: null,
      target: 'staging',
      env: {},
    });
    expect(missing.ok).toBe(false);
  });

  it('8) no leakage de secretos en errores', () => {
    const secret = 'super-secret-service-role-key-do-not-leak';
    const telegram = '123456:ABC-DEF_telegram_bot_token';
    const cron = 'cron-secret-value-xyz';
    const r = evaluateSupabaseUrlForTarget({
      url: productionUrl,
      target: 'staging',
      env: {
        SUPABASE_SERVICE_ROLE_KEY: secret,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-secret-should-not-appear',
        TELEGRAM_BOT_TOKEN_STAGING: telegram,
        CRON_SECRET: cron,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toContain(secret);
      expect(r.error).not.toContain('anon-secret-should-not-appear');
      expect(r.error).not.toContain(telegram);
      expect(r.error).not.toContain(cron);
      expect(r.error).not.toMatch(/service.?role/i);
    }
  });

  it('assertStagingSupabaseUrl throws on production', () => {
    expect(() => assertStagingSupabaseUrl(productionUrl, {})).toThrow(/PRODUCTION/);
  });

  it('preview and local resolve to staging target', () => {
    expect(resolveAventaSupabaseTarget({ VERCEL_ENV: 'preview' })).toBe('staging');
    expect(resolveAventaSupabaseTarget({})).toBe('staging');
    expect(resolveAventaSupabaseTarget({ VERCEL_ENV: 'production' })).toBe(
      'production',
    );
    expect(resolveAventaSupabaseTarget({ AVENTA_SUPABASE_TARGET: 'staging' })).toBe(
      'staging',
    );
    expect(
      resolveAventaSupabaseTarget({ AVENTA_SUPABASE_TARGET: 'production' }),
    ).toBe('production');
  });

  it('expected staging ref !== production ref invariant', () => {
    expect(STAGING_SUPABASE_REF).not.toBe(PRODUCTION_SUPABASE_REF);
  });
});
