/**
 * Multi-axis rotation schedule — controlled, deterministic, flag-gated.
 * Brand + price-band prepared but not required for first runs.
 */

import type { DiscoveryExperimentVariant } from './discoveryExperiment';
import { getDiscoveryExperimentCaps } from './discoveryExperiment';

export type AxisBitmap = {
  page: boolean;
  seed: boolean;
  category: boolean;
  query: boolean;
  brand: boolean;
  price_band: boolean;
};

export type RotationPlan = {
  variant: DiscoveryExperimentVariant;
  axisBitmap: AxisBitmap;
  pages: number[];
  seedOffset: number;
  maxSeeds: number;
  categoryOffset: number;
  queryOffset: number;
};

export function emptyAxisBitmap(): AxisBitmap {
  return {
    page: false,
    seed: false,
    category: false,
    query: false,
    brand: false,
    price_band: false,
  };
}

/**
 * Build rotation plan for a run.
 * baseline_sticky → no extra axes (control).
 * multi_axis_rotation → up to 4 axes: page, seed, category, query (not all forced every run).
 */
export function buildRotationPlan(input: {
  variant: DiscoveryExperimentVariant;
  runIndex?: number;
  nowMs?: number;
  env?: NodeJS.ProcessEnv;
}): RotationPlan {
  const caps = getDiscoveryExperimentCaps(input.env);
  const runIndex =
    input.runIndex ??
    Math.floor(((input.nowMs ?? Date.now()) / 3_600_000) % 10_000);

  if (input.variant === 'baseline_sticky') {
    return {
      variant: input.variant,
      axisBitmap: emptyAxisBitmap(),
      pages: [1],
      seedOffset: 0,
      maxSeeds: caps.maxSeeds,
      categoryOffset: 0,
      queryOffset: 0,
    };
  }

  // Evidence-based: page axis OFF by default (page>=2 novelty≈0 on ML).
  // Prefer query + category + seed. Ops can force page via HUNTER_DISCOVERY_ENABLE_PAGE_AXIS=1.
  const enablePageAxis = ['1', 'true', 'on', 'yes'].includes(
    (input.env?.HUNTER_DISCOVERY_ENABLE_PAGE_AXIS ?? process.env.HUNTER_DISCOVERY_ENABLE_PAGE_AXIS ?? '0')
      .trim()
      .toLowerCase(),
  );
  const phase = runIndex % 3;
  const axisBitmap: AxisBitmap = {
    page: enablePageAxis,
    seed: true,
    category: phase !== 0,
    query: phase !== 1,
    brand: false,
    price_band: false,
  };

  const pages: number[] = enablePageAxis
    ? (() => {
        const out: number[] = [];
        for (let p = 1; p <= caps.maxPages; p += 1) out.push(p);
        return out;
      })()
    : [1];

  return {
    variant: input.variant,
    axisBitmap,
    pages: axisBitmap.page ? pages : [1],
    seedOffset: runIndex,
    maxSeeds: caps.maxSeeds,
    categoryOffset: runIndex,
    queryOffset: runIndex * 3,
  };
}

/** Deterministic subset of a list given offset + max. */
export function rotateSubset<T>(items: readonly T[], offset: number, max: number): T[] {
  if (items.length === 0 || max <= 0) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(max, items.length); i += 1) {
    out.push(items[(start + i) % items.length]!);
  }
  return out;
}
