import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BenchmarkComparison, BenchmarkRunRecord, HunterResult } from './types';

export const HUNTER_BENCHMARK_REPORTS_DIR = 'scripts/_hunter_benchmark_reports';

const memoryRuns = new Map<string, BenchmarkRunRecord>();

export type BenchmarkStoreMode = 'memory' | 'file';

export type SaveBenchmarkRunInput = {
  result: HunterResult;
  comparison: BenchmarkComparison | null;
  savedAt?: string;
};

function recordKey(runId: string, hunterId: string): string {
  return `${hunterId}::${runId}`;
}

function toRecord(input: SaveBenchmarkRunInput): BenchmarkRunRecord {
  return {
    schemaVersion: 'hunter_benchmark.v1',
    runId: input.result.runId,
    sourceId: input.result.sourceId,
    hunterId: input.result.hunterId,
    savedAt: input.savedAt ?? new Date().toISOString(),
    result: input.result,
    comparison: input.comparison,
  };
}

function reportFileName(hunterId: string, runId: string): string {
  const safeHunter = hunterId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeRun = runId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${safeHunter}__${safeRun}.json`;
}

function reportFilePath(baseDir: string, hunterId: string, runId: string): string {
  return join(baseDir, reportFileName(hunterId, runId));
}

export async function saveBenchmarkRun(
  input: SaveBenchmarkRunInput,
  options: { mode?: BenchmarkStoreMode; baseDir?: string } = {},
): Promise<BenchmarkRunRecord> {
  const mode = options.mode ?? 'file';
  const record = toRecord(input);
  const key = recordKey(record.runId, record.hunterId);
  memoryRuns.set(key, record);

  if (mode === 'memory') return record;

  const baseDir = options.baseDir ?? join(process.cwd(), HUNTER_BENCHMARK_REPORTS_DIR);
  await mkdir(baseDir, { recursive: true });
  const filePath = reportFilePath(baseDir, record.hunterId, record.runId);
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

export async function loadBenchmarkRun(
  runId: string,
  hunterId: string,
  options: { mode?: BenchmarkStoreMode; baseDir?: string } = {},
): Promise<BenchmarkRunRecord | null> {
  const mode = options.mode ?? 'file';
  const key = recordKey(runId, hunterId);
  const cached = memoryRuns.get(key);
  if (cached) return cached;

  if (mode === 'memory') return null;

  const baseDir = options.baseDir ?? join(process.cwd(), HUNTER_BENCHMARK_REPORTS_DIR);
  const filePath = reportFilePath(baseDir, hunterId, runId);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as BenchmarkRunRecord;
    memoryRuns.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function listBenchmarkRuns(
  options: { mode?: BenchmarkStoreMode; baseDir?: string } = {},
): Promise<BenchmarkRunRecord[]> {
  const mode = options.mode ?? 'file';
  const fromMemory = [...memoryRuns.values()];
  if (mode === 'memory') {
    return fromMemory.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  const baseDir = options.baseDir ?? join(process.cwd(), HUNTER_BENCHMARK_REPORTS_DIR);
  try {
    const files = await readdir(baseDir);
    const records: BenchmarkRunRecord[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(baseDir, file), 'utf8');
      records.push(JSON.parse(raw) as BenchmarkRunRecord);
    }
    for (const record of fromMemory) {
      if (!records.some((row) => recordKey(row.runId, row.hunterId) === recordKey(record.runId, record.hunterId))) {
        records.push(record);
      }
    }
    return records.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return fromMemory.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
}

export function clearBenchmarkMemoryStore(): void {
  memoryRuns.clear();
}
