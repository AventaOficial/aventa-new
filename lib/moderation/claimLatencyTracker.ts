const SAMPLES: number[] = [];
const MAX_SAMPLES = 120;

/** En memoria del proceso; se pierde en redeploy/cold start (limitación conocida). */
export function recordClaimLatencyMs(ms: number): void {
  SAMPLES.push(ms);
  if (SAMPLES.length > MAX_SAMPLES) SAMPLES.shift();
}

export function getClaimLatencyStats(): { lastMs: number | null; p95Ms: number | null; sampleCount: number } {
  if (SAMPLES.length === 0) {
    return { lastMs: null, p95Ms: null, sampleCount: 0 };
  }
  const sorted = [...SAMPLES].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    lastMs: SAMPLES[SAMPLES.length - 1] ?? null,
    p95Ms: sorted[p95Index] ?? null,
    sampleCount: SAMPLES.length,
  };
}
