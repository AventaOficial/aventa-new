/**
 * FASE 0.1 — Kill-switch centralizado del money path.
 * Independiente de REWARDS_PROGRAM_ACTIVE / COMMISSION_PROGRAM_ACTIVE.
 *
 * Production: ausente o valor inválido → fail-closed (congelado).
 * Explicit false/0/no/off → descongelado (solo con intención clara).
 */

export const MONEY_PATH_FROZEN_CODE = 'money_path_frozen';

export const MONEY_PATH_FROZEN_MESSAGE =
  'Money path congelado (FASE 0.1). Operación monetaria bloqueada.';

/** Runtime de producción Vercel o Node production (no preview/dev). */
export function isProductionRuntime(): boolean {
  const vercelEnv = (process.env.VERCEL_ENV ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') return true;
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * true → bloquear movimiento/liquidación de dinero.
 * false → permitir (solo si env es explícitamente off, o no-prod con ausente).
 */
export function isMoneyPathFrozen(): boolean {
  const raw = process.env.MONEY_PATH_FROZEN;
  const v = (raw ?? '').trim().toLowerCase();

  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;

  // Ausente o inválido
  if (isProductionRuntime()) return true;
  return false;
}

export function moneyPathFrozenHttpBody(): {
  error: string;
  code: string;
  frozen: true;
} {
  return {
    error: MONEY_PATH_FROZEN_MESSAGE,
    code: MONEY_PATH_FROZEN_CODE,
    frozen: true,
  };
}
