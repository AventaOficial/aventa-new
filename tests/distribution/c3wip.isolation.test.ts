/**
 * Guard: Distribution C3 reclaim WIP stays outside C1/C2 contract + compile.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_EVENT_TYPES,
  DISTRIBUTION_PUBLICATION_STATUSES,
} from '@/lib/distribution';

const ROOT = process.cwd();

describe('Distribution C3 WIP isolation (build restoration)', () => {
  it('reclaim lives under c3-wip, not on C1 public exports', () => {
    expect(existsSync(join(ROOT, 'lib/distribution/c3-wip/reclaim.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'lib/distribution/reclaim.ts'))).toBe(false);

    const index = readFileSync(join(ROOT, 'lib/distribution/index.ts'), 'utf8');
    expect(index).not.toMatch(/reclaim/);
    expect(index).not.toMatch(/c3-wip/);
  });

  it('tsconfig excludes c3-wip from compilation', () => {
    const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
    expect(tsconfig).toMatch(/lib\/distribution\/c3-wip/);
  });

  it('C1 event/status unions do not include C3-only values', () => {
    expect(DISTRIBUTION_EVENT_TYPES).not.toContain('publication_reclaimed');
    expect(DISTRIBUTION_EVENT_TYPES).not.toContain('publication_unknown_outcome');
    expect(DISTRIBUTION_PUBLICATION_STATUSES).not.toContain('unknown_outcome');
  });

  it('pending migration for C3 remains docs-only (not applied by this isolation)', () => {
    const mig = join(
      ROOT,
      'docs/supabase-migrations/20260918_distribution_c3_unknown_outcome.sql',
    );
    expect(existsSync(mig)).toBe(true);
    const sql = readFileSync(mig, 'utf8');
    expect(sql).toContain('unknown_outcome');
    expect(sql).toContain('publication_reclaimed');
  });
});
