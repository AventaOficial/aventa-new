/**
 * S7.2 — staging supply window cap + dedicated author guards.
 */

import { describe, expect, it } from 'vitest';
import {
  S71_SEED_AUTHOR_ID,
  S72_STAGING_WINDOW_HARD_CAP,
  assertDedicatedMachineAuthor,
  resolveStagingSupplyWindowCap,
} from '@/lib/bots/ingest/stagingSupplyWindow';
import { resolveCanaryInsertCap, S67_CANARY_HARD_CAP } from '@/lib/bots/ingest/machineInsertCanary';

describe('S7.2 stagingSupplyWindow', () => {
  it('hard-caps window at 5 regardless of larger request', () => {
    expect(resolveStagingSupplyWindowCap(100, 99)).toBe(S72_STAGING_WINDOW_HARD_CAP);
    expect(resolveStagingSupplyWindowCap(3, 5)).toBe(3);
    expect(resolveStagingSupplyWindowCap(10, 0)).toBe(0);
  });

  it('never exceeds S6.7 canary hard cap', () => {
    expect(S72_STAGING_WINDOW_HARD_CAP).toBeLessThanOrEqual(S67_CANARY_HARD_CAP);
    expect(resolveStagingSupplyWindowCap(50, 5)).toBe(
      resolveCanaryInsertCap(50, 5),
    );
  });

  it('rejects S7.1 seed admin as dedicated machine author', () => {
    expect(assertDedicatedMachineAuthor(S71_SEED_AUTHOR_ID)).toEqual({
      ok: false,
      reason: 'seed_admin_author_forbidden_for_s72',
    });
  });

  it('accepts a distinct UUID', () => {
    expect(
      assertDedicatedMachineAuthor('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    ).toEqual({ ok: true, reason: null });
  });

  it('rejects empty / invalid ids', () => {
    expect(assertDedicatedMachineAuthor('').ok).toBe(false);
    expect(assertDedicatedMachineAuthor('not-a-uuid').ok).toBe(false);
  });
});
