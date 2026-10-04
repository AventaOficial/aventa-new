import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyZeroCountCheck, finalizeIntegrityCheck } from '@/lib/server/integrityClassification';
import { INTEGRITY_CHECK_SPECS } from '@/lib/server/systemIntegrity';

const AT = '2026-10-04T12:00:00.000Z';
const sql = readFileSync(join(process.cwd(), 'docs/supabase-migrations/client_view_write_lockdown.sql'), 'utf8');
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
const spec = INTEGRITY_CHECK_SPECS['security.client_writable_views'];

describe('client view write lockdown migration', () => {
  it('revokes every client write privilege on all views and materialized views in public', () => {
    expect(code).toMatch(/c\.relkind IN \('v', 'm'\)/);
    expect(code).toMatch(/n\.nspname = 'public'/);
    expect(code).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',
    );
  });

  it('never grants or revokes SELECT (feed reads stay intact)', () => {
    expect(code).not.toMatch(/\bGRANT\b[^;]*\bTO\s+(anon|authenticated)\b/i);
    expect(code).not.toMatch(/REVOKE[^;]*\bSELECT\b/i);
  });

  it('probe function is invoker, pinned search_path and service_role only', () => {
    expect(code).toMatch(/FUNCTION public\.client_writable_views\(\)[\s\S]*SECURITY INVOKER[\s\S]*SET search_path = ''/);
    expect(code).toContain('REVOKE ALL ON FUNCTION public.client_writable_views() FROM PUBLIC, anon, authenticated;');
    expect(code).toContain('GRANT EXECUTE ON FUNCTION public.client_writable_views() TO service_role;');
    for (const p of ['INSERT', 'UPDATE', 'DELETE']) expect(code).toContain(`('${p}')`);
    expect(code).toContain("('anon'), ('authenticated')");
  });
});

describe('security.client_writable_views integrity check', () => {
  it('is critical and fails the run on any writable view', () => {
    expect(spec).toMatchObject({ severity: 'critical', onViolation: 'FAIL', onSchemaMissing: 'FAIL' });
    const raw = classifyZeroCountCheck({
      name: 'security.client_writable_views',
      error: null,
      count: 2,
      label: 'client_writable_view_grants (ofertas_ranked_general)',
      migration: 'client_view_write_lockdown.sql',
    });
    const c = finalizeIntegrityCheck(raw, spec, AT);
    expect(c).toMatchObject({ status: 'FAIL', ok: false, severity: 'critical' });
    expect(c.evidence).toContain('ofertas_ranked_general');
  });

  it('passes with zero rows and fails when the probe is missing or errors', () => {
    const pass = classifyZeroCountCheck({
      name: 'security.client_writable_views',
      error: null,
      count: 0,
      label: 'client_writable_view_grants',
      migration: 'client_view_write_lockdown.sql',
    });
    expect(finalizeIntegrityCheck(pass, spec, AT).status).toBe('PASS');
    const missing = classifyZeroCountCheck({
      name: 'security.client_writable_views',
      error: { code: 'PGRST202', message: 'Could not find the function public.client_writable_views' },
      count: null,
      label: 'client_writable_view_grants',
      migration: 'client_view_write_lockdown.sql',
    });
    expect(finalizeIntegrityCheck(missing, spec, AT).status).toBe('FAIL');
  });

  it('the runner calls the probe through the service client', () => {
    const src = readFileSync(join(process.cwd(), 'lib/server/systemIntegrity.ts'), 'utf8');
    expect(src).toContain("supabase.rpc('client_writable_views')");
    expect(src).toContain("name: 'security.client_writable_views'");
  });
});
