import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyGenericCheck,
  finalizeIntegrityCheck,
  integrityStatusOf,
  type IntegrityCheckSpec,
} from '@/lib/server/integrityClassification';
import { finalizeIntegrityResult, INTEGRITY_CHECK_SPECS } from '@/lib/server/systemIntegrity';
import { deriveAreaStatusesFromIntegrity } from '@/lib/operations/areaHealth';

const AT = '2026-10-04T12:00:00.000Z';
const warnSpec: IntegrityCheckSpec = { severity: 'medium', onViolation: 'WARN', onSchemaMissing: 'NOT_APPLICABLE', action: 'do x' };

describe('integrity status model PASS/WARN/FAIL/NOT_APPLICABLE', () => {
  it('a passing check carries no severity or action', () => {
    const c = finalizeIntegrityCheck({ name: 'a', ok: true, detail: 'n=0', state: 'pass' }, warnSpec, AT);
    expect(c).toMatchObject({ status: 'PASS', ok: true, severity: null, action: null, checkedAt: AT, evidence: 'n=0' });
  });

  it('violations follow the spec; WARN does not fail the run', () => {
    const c = finalizeIntegrityCheck({ name: 'a', ok: false, detail: 'n=3', state: 'fail' }, warnSpec, AT);
    expect(c).toMatchObject({ status: 'WARN', ok: true, severity: 'medium', action: 'do x' });
  });

  it('query errors are always FAIL, never PASS (unknown is not hidden)', () => {
    const raw = classifyGenericCheck({ name: 'a', error: { code: '57014', message: 'timeout' }, violated: false, detail: 'n=0' });
    const c = finalizeIntegrityCheck(raw, warnSpec, AT);
    expect(c.status).toBe('FAIL');
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/desconocido/);
  });

  it('schema missing maps per spec (NOT_APPLICABLE only when declared)', () => {
    const raw = classifyGenericCheck({ name: 'a', error: { code: 'PGRST205', message: 'x' }, violated: false, detail: '' });
    expect(finalizeIntegrityCheck(raw, warnSpec, AT).status).toBe('NOT_APPLICABLE');
    expect(finalizeIntegrityCheck(raw, undefined, AT).status).toBe('FAIL');
  });

  it('result summary counts every status and ok only reflects FAIL', () => {
    const r = finalizeIntegrityResult(
      [
        { name: 'feed.home.smoke', ok: true, detail: 'items=5', state: 'pass' },
        { name: 'moderation.orphan_locks', ok: false, detail: 'locked_non_pending=9', state: 'fail' },
        { name: 'supply.worker_recent', ok: false, detail: 'missing', state: 'schema_missing' },
      ],
      AT,
      AT,
    );
    expect(r.summary).toEqual({ total: 3, failed: 0, passed: 1, warned: 1, notApplicable: 1 });
    expect(r.ok).toBe(true);
    const lifecycle = finalizeIntegrityResult([{ name: 'lifecycle.last_run', ok: false, detail: 'none', state: 'stale' }], AT, AT);
    expect(lifecycle.ok).toBe(false);
    expect(lifecycle.checks[0]).toMatchObject({ status: 'FAIL', severity: 'high' });
  });

  it('every check emitted by the runner has an explicit spec', () => {
    const src = readFileSync(join(process.cwd(), 'lib/server/systemIntegrity.ts'), 'utf8');
    const runner = src.slice(src.indexOf('export async function runSystemIntegrityChecks'));
    const names = [...runner.matchAll(/name: '([a-z_.0-9]+)'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(15);
    for (const n of names) expect(INTEGRITY_CHECK_SPECS[n], n).toBeDefined();
  });

  it('price logic no longer compares a column to a string literal', () => {
    const src = readFileSync(join(process.cwd(), 'lib/server/systemIntegrity.ts'), 'utf8');
    expect(src).not.toContain(".filter('price', 'gt', 'original_price')");
  });

  it('legacy snapshots without status stay readable', () => {
    expect(integrityStatusOf({ ok: true })).toBe('PASS');
    expect(integrityStatusOf({ ok: false })).toBe('FAIL');
    expect(integrityStatusOf({ ok: true, status: 'WARN' })).toBe('WARN');
  });

  it('area lights: WARN is yellow, NOT_APPLICABLE does not penalize', () => {
    const areas = deriveAreaStatusesFromIntegrity({
      ok: true,
      checks: [
        { name: 'view.ofertas_ranked_general', ok: true, status: 'WARN' },
        { name: 'feed.home.smoke', ok: true, status: 'NOT_APPLICABLE' },
        { name: 'runtime.exception', ok: true, status: 'PASS' },
      ],
    });
    expect(areas.vista).toBe('warn');
    expect(areas.feed).toBe('ok');
    expect(areas.runtime).toBe('ok');
  });
});
