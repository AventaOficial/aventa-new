import { describe, expect, it } from 'vitest';
import {
  classifyFreshnessCheck,
  classifyImageIntegrityCheck,
  classifyLifecycleRunCheck,
  classifyZeroCountCheck,
  describeQueryError,
  isSchemaMissingError,
} from '@/lib/server/integrityClassification';

describe('integrity classification', () => {
  it('detects schema drift by code or message', () => {
    expect(isSchemaMissingError({ code: '42703', message: 'column x does not exist' })).toBe(true);
    expect(isSchemaMissingError({ code: 'PGRST205', message: '' })).toBe(true);
    expect(isSchemaMissingError({ code: '57014', message: 'canceling statement' })).toBe(false);
    expect(isSchemaMissingError(null)).toBe(false);
  });

  it('never renders an empty error detail', () => {
    expect(describeQueryError({ code: '', message: '' })).toBe('no_code: empty error message');
  });

  it('freshness: schema drift is labelled, not reported as overdue', () => {
    const check = classifyFreshnessCheck({
      probeError: { code: '42703', message: 'column offer_health_state.next_check_at does not exist' },
      countError: null,
      overdue: null,
    });
    expect(check.state).toBe('schema_missing');
    expect(check.ok).toBe(false);
    expect(check.detail).toContain('launch_hardening_v2.sql');
    expect(check.detail).toContain('legacy fallback');
  });

  it('freshness: query error vs overdue vs pass', () => {
    expect(
      classifyFreshnessCheck({ probeError: null, countError: { code: '57014', message: 'timeout' }, overdue: null }).state
    ).toBe('query_error');
    expect(classifyFreshnessCheck({ probeError: null, countError: null, overdue: 400 }).state).toBe('overdue');
    const pass = classifyFreshnessCheck({ probeError: null, countError: null, overdue: 3 });
    expect(pass).toMatchObject({ ok: true, state: 'pass' });
  });

  it('lifecycle run recency', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    expect(
      classifyLifecycleRunCheck({ error: null, lastStartedAt: '2026-10-04T11:17:00Z', backlogRemaining: false, nowMs: now })
    ).toMatchObject({ ok: true, state: 'pass' });
    expect(
      classifyLifecycleRunCheck({ error: null, lastStartedAt: '2026-10-04T07:00:00Z', backlogRemaining: false, nowMs: now })
        .state
    ).toBe('stale');
    expect(classifyLifecycleRunCheck({ error: null, lastStartedAt: null, backlogRemaining: null, nowMs: now }).state).toBe(
      'stale'
    );
    expect(
      classifyLifecycleRunCheck({
        error: { code: 'PGRST205', message: "Could not find the table 'public.offer_lifecycle_runs'" },
        lastStartedAt: null,
        backlogRemaining: null,
        nowMs: now,
      }).state
    ).toBe('schema_missing');
  });

  it('zero-count invariants', () => {
    expect(
      classifyZeroCountCheck({ name: 'moderation.orphan_locks', error: null, count: 0, label: 'l', migration: 'n/a' }).ok
    ).toBe(true);
    const bad = classifyZeroCountCheck({ name: 'moderation.orphan_locks', error: null, count: 9, label: 'l', migration: 'n/a' });
    expect(bad).toMatchObject({ ok: false, state: 'fail', detail: 'l=9' });
  });

  it('image check ignores non-operational offers', () => {
    const check = classifyImageIntegrityCheck({
      error: null,
      activeMissing: 0,
      pendingMissing: 0,
      nonOperationalMissing: 42,
    });
    expect(check.ok).toBe(true);
    expect(check.detail).toContain('non_operational_missing=42');
    expect(
      classifyImageIntegrityCheck({ error: null, activeMissing: 1, pendingMissing: 0, nonOperationalMissing: 0 }).ok
    ).toBe(false);
  });
});
