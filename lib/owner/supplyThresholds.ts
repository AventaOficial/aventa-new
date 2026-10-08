/**
 * Umbrales de salud de oferta. Un solo lugar.
 * Cada variable de entorno es opcional. Un valor ausente o inválido conserva el default.
 * Las tasas van de 0 a 1. Los pendientes son conteos.
 */

export type SupplyThresholds = {
  topAuthorWarning: number;
  topAuthorCritical: number;
  top3Warning: number;
  top3Critical: number;
  rejectionWarning: number;
  rejectionCritical: number;
  minDecisionsForRejection: number;
  pendingWarning: number;
  pendingCritical: number;
  machineShareWarning: number;
  machineShareCritical: number;
  humanShareWarning: number;
  minAttributedForActorHealth: number;
  retailerWarning: number;
  retailerCritical: number;
  categoryWarning: number;
  categoryCritical: number;
  missingSourceWarning: number;
  missingSourceCritical: number;
  /** Cobertura mínima de autor clasificado para publicar participación humana. */
  minHumanCoverage: number;
};

export const DEFAULT_SUPPLY_THRESHOLDS: SupplyThresholds = {
  topAuthorWarning: 0.4,
  topAuthorCritical: 0.7,
  top3Warning: 0.75,
  top3Critical: 0.9,
  rejectionWarning: 0.4,
  rejectionCritical: 0.6,
  minDecisionsForRejection: 10,
  pendingWarning: 50,
  pendingCritical: 150,
  machineShareWarning: 0.7,
  machineShareCritical: 0.9,
  humanShareWarning: 0.2,
  minAttributedForActorHealth: 10,
  retailerWarning: 0.6,
  retailerCritical: 0.85,
  categoryWarning: 0.6,
  categoryCritical: 0.85,
  missingSourceWarning: 0.5,
  missingSourceCritical: 0.8,
  minHumanCoverage: 0.8,
};

function readRatio(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return fallback;
  return value;
}

function readCount(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw == null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return fallback;
  return value;
}

export function supplyThresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): SupplyThresholds {
  const base = DEFAULT_SUPPLY_THRESHOLDS;
  return {
    topAuthorWarning: readRatio(env, 'SUPPLY_TOP_AUTHOR_WARNING', base.topAuthorWarning),
    topAuthorCritical: readRatio(env, 'SUPPLY_TOP_AUTHOR_CRITICAL', base.topAuthorCritical),
    top3Warning: readRatio(env, 'SUPPLY_TOP3_WARNING', base.top3Warning),
    top3Critical: readRatio(env, 'SUPPLY_TOP3_CRITICAL', base.top3Critical),
    rejectionWarning: readRatio(env, 'SUPPLY_REJECTION_WARNING', base.rejectionWarning),
    rejectionCritical: readRatio(env, 'SUPPLY_REJECTION_CRITICAL', base.rejectionCritical),
    minDecisionsForRejection: readCount(env, 'SUPPLY_MIN_DECISIONS', base.minDecisionsForRejection),
    pendingWarning: readCount(env, 'SUPPLY_PENDING_WARNING', base.pendingWarning),
    pendingCritical: readCount(env, 'SUPPLY_PENDING_CRITICAL', base.pendingCritical),
    machineShareWarning: readRatio(env, 'SUPPLY_MACHINE_SHARE_WARNING', base.machineShareWarning),
    machineShareCritical: readRatio(env, 'SUPPLY_MACHINE_SHARE_CRITICAL', base.machineShareCritical),
    humanShareWarning: readRatio(env, 'SUPPLY_HUMAN_SHARE_WARNING', base.humanShareWarning),
    minAttributedForActorHealth: readCount(env, 'SUPPLY_MIN_ATTRIBUTED', base.minAttributedForActorHealth),
    retailerWarning: readRatio(env, 'SUPPLY_RETAILER_WARNING', base.retailerWarning),
    retailerCritical: readRatio(env, 'SUPPLY_RETAILER_CRITICAL', base.retailerCritical),
    categoryWarning: readRatio(env, 'SUPPLY_CATEGORY_WARNING', base.categoryWarning),
    categoryCritical: readRatio(env, 'SUPPLY_CATEGORY_CRITICAL', base.categoryCritical),
    missingSourceWarning: readRatio(env, 'SUPPLY_MISSING_SOURCE_WARNING', base.missingSourceWarning),
    missingSourceCritical: readRatio(env, 'SUPPLY_MISSING_SOURCE_CRITICAL', base.missingSourceCritical),
    minHumanCoverage: readRatio(env, 'SUPPLY_MIN_HUMAN_COVERAGE', base.minHumanCoverage),
  };
}
