import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearBenchmarkMemoryStore,
  compareHunterRun,
  listBenchmarkRuns,
  loadBenchmarkRun,
  normalizeHunterResult,
  saveBenchmarkRun,
} from '@/lib/supply/hunterBenchmark';

let tempDir: string | null = null;

afterEach(async () => {
  clearBenchmarkMemoryStore();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('hunter benchmark store', () => {
  it('persiste y carga en modo file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hunter-benchmark-'));
    const normalized = normalizeHunterResult({
      hunterId: 'hunter-a',
      runId: 'run-store',
      sourceId: 'chatgpt_scheduled',
      collectedAt: '2026-09-18T12:00:00.000Z',
      completedAt: '2026-09-18T12:00:05.000Z',
      payload: { candidates: [] },
    });
    if (!normalized.ok) throw new Error('fixture failed');

    const comparison = compareHunterRun({
      hunterResult: normalized.result,
      aventaEvaluations: [],
    });

    await saveBenchmarkRun(
      { result: normalized.result, comparison },
      { mode: 'file', baseDir: tempDir },
    );

    const loaded = await loadBenchmarkRun('run-store', 'hunter-a', {
      mode: 'file',
      baseDir: tempDir,
    });
    expect(loaded?.runId).toBe('run-store');
    expect(loaded?.comparison?.metrics.candidatesFound).toBe(0);

    const files = await listBenchmarkRuns({ mode: 'file', baseDir: tempDir });
    expect(files).toHaveLength(1);

    const raw = await readFile(join(tempDir, files[0] ? `hunter-a__run-store.json` : ''), 'utf8');
    expect(raw).toContain('hunter_benchmark.v1');
  });

  it('usa memoria en modo memory sin tocar disco', async () => {
    const normalized = normalizeHunterResult({
      hunterId: 'hunter-b',
      runId: 'run-mem',
      sourceId: 'grok',
      collectedAt: '2026-09-18T12:00:00.000Z',
      completedAt: '2026-09-18T12:00:05.000Z',
      payload: { deals: [] },
    });
    if (!normalized.ok) throw new Error('fixture failed');

    await saveBenchmarkRun(
      { result: normalized.result, comparison: null },
      { mode: 'memory' },
    );

    const listed = await listBenchmarkRuns({ mode: 'memory' });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.sourceId).toBe('grok');
  });
});
