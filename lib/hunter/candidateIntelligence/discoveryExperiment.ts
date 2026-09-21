/**

 * Hunter Discovery Experiment v2 — feature flag (default OFF).

 * Shadow/observation only. Never enables mint/publish/money.

 *

 * A = baseline_sticky (discovery)

 * B = multi_axis_rotation (discovery)

 * C/D = same discovery + shadow taxonomy v2 (always dual-labeled when experiment ON)

 */



export const HUNTER_DISCOVERY_EXPERIMENT_ENV = 'HUNTER_DISCOVERY_EXPERIMENT' as const;

export const HUNTER_DISCOVERY_EXPERIMENT_ID = 'discovery_exp_v2' as const;

/** Prior experiment id (read-only reference). */

export const HUNTER_DISCOVERY_EXPERIMENT_ID_V1 = 'discovery_exp_v1' as const;



export type DiscoveryExperimentVariant = 'baseline_sticky' | 'multi_axis_rotation';



export function isHunterDiscoveryExperimentEnabled(

  env: NodeJS.ProcessEnv = process.env,

): boolean {

  const raw = (env[HUNTER_DISCOVERY_EXPERIMENT_ENV] ?? '0').trim().toLowerCase();

  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';

}



export function getDiscoveryExperimentVariant(

  env: NodeJS.ProcessEnv = process.env,

): DiscoveryExperimentVariant {

  const raw = (env.HUNTER_DISCOVERY_EXPERIMENT_VARIANT ?? 'baseline_sticky')

    .trim()

    .toLowerCase();

  if (raw === 'multi_axis_rotation' || raw === 'rotation' || raw === 'multi') {

    return 'multi_axis_rotation';

  }

  return 'baseline_sticky';

}



/** Conservative caps — never unbounded scrape. */

export function getDiscoveryExperimentCaps(env: NodeJS.ProcessEnv = process.env) {

  const maxPages = clampInt(env.HUNTER_DISCOVERY_EXPERIMENT_MAX_PAGES, 1, 5, 2);

  const maxIds = clampInt(env.HUNTER_DISCOVERY_EXPERIMENT_MAX_IDS, 20, 200, 120);

  const maxSeeds = clampInt(env.HUNTER_DISCOVERY_EXPERIMENT_MAX_SEEDS, 1, 20, 8);

  const abort403Rate = clampFloat(env.HUNTER_DISCOVERY_EXPERIMENT_ABORT_403_RATE, 0.1, 1, 0.5);

  return { maxPages, maxIds, maxSeeds, abort403Rate };

}



function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {

  const n = Number.parseInt(raw ?? '', 10);

  if (!Number.isFinite(n)) return fallback;

  return Math.min(max, Math.max(min, n));

}



function clampFloat(raw: string | undefined, min: number, max: number, fallback: number): number {

  const n = Number.parseFloat(raw ?? '');

  if (!Number.isFinite(n)) return fallback;

  return Math.min(max, Math.max(min, n));

}


