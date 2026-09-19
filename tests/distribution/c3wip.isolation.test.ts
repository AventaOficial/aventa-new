/**
 * Guard: C3 is promoted out of WIP; migration remains the schema authority.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_EVENT_TYPES,
  DISTRIBUTION_PUBLICATION_STATUSES,
} from '@/lib/distribution';

const ROOT = process.cwd();

describe('Distribution C3 promotion (replaces WIP isolation)', () => {
  it('reclaim is under lib/distribution (not c3-wip)', () => {
    expect(existsSync(join(ROOT, 'lib/distribution/reclaim.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'lib/distribution/c3-wip/reclaim.ts'))).toBe(false);

    const index = readFileSync(join(ROOT, 'lib/distribution/index.ts'), 'utf8');
    expect(index).toMatch(/from '\.\/reclaim'/);
    expect(index).not.toMatch(/c3-wip/);
  });

  it('tsconfig no longer excludes c3-wip (folder removed from compile gate)', () => {
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    expect(tsconfig).not.toMatch(/lib\/distribution\/c3-wip/);
  });

  it('C3 status/event unions are explicit in C1 surface', () => {
    expect(DISTRIBUTION_PUBLICATION_STATUSES).toContain('unknown_outcome');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('unknown_outcome');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('reclaimed');
    expect(DISTRIBUTION_EVENT_TYPES).toContain('lease_acquired');
  });

  it('C3 migration exists and is the schema change vehicle', () => {
    const mig = join(
      ROOT,
      'docs/supabase-migrations/20260918_distribution_c3_unknown_outcome.sql',
    );
    expect(existsSync(mig)).toBe(true);
    const sql = readFileSync(mig, 'utf8');
    expect(sql).toContain('unknown_outcome');
    expect(sql).toContain('lease_acquired');
    expect(sql).toContain('Apply ONLY on staging');
  });
});
