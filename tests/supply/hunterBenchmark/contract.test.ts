import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('S8.1 hunter benchmark contract', () => {
  it('no toca supply production, distribution ni rewards', () => {
    const files = [
      'lib/supply/hunterBenchmark/index.ts',
      'lib/supply/hunterBenchmark/store.ts',
      'lib/supply/hunterBenchmark/normalizeHunterResult.ts',
      'lib/supply/hunterBenchmark/compareRuns.ts',
    ];
    for (const file of files) {
      const text = src(file);
      expect(text).not.toMatch(/insertIngestedOffer|offers\.pending|distribution/i);
      expect(text).not.toMatch(/lib\/rewards|lib\/commissions|lib\/ledger/);
      expect(text).not.toMatch(/persistSupplyRouterReport|recordSupplyRun/);
    }
  });

  it('documenta handoff S8 evaluateOpportunity', () => {
    const text = src('lib/supply/hunterBenchmark/index.ts');
    expect(text).toMatch(/evaluateOpportunity/i);
    expect(text).toMatch(/hunterCandidateToS8Input/i);
    expect(text).toMatch(/never auto-insert offers/i);
  });

  it('migración SQL es staging-only', () => {
    const migration = src('docs/supabase-migrations/20260918_hunter_benchmark_staging.sql');
    expect(migration).toMatch(/STAGING ONLY/i);
    expect(migration).toMatch(/hunter_benchmark_runs/);
    expect(migration).toMatch(/hunter_benchmark_results/);
    expect(migration).not.toMatch(/offers/i);
  });
});
