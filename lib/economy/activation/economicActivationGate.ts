/**
 * Compuerta única de activación económica.
 * Ninguna variable de entorno abre pagos por sí sola.
 * El veredicto de producción es PAYOUT BLOCKED hasta que cada requisito esté aprobado.
 */

export const ECONOMIC_ACTIVATION_REQUIREMENTS = [
  'commission_confirmation',
  'reward_rules',
  'fiscal_policy',
  'tax_documentation',
  'payment_identity',
  'fraud_rules',
  'reversal_behavior',
  'payout_provider',
  'reconciliation',
  'legal_terms',
  'privacy',
  'production_monitoring',
] as const;

export type EconomicActivationRequirementId = (typeof ECONOMIC_ACTIVATION_REQUIREMENTS)[number];

export type EconomicActivationApprovals = Record<EconomicActivationRequirementId, boolean>;

export type EconomicActivationGate = {
  payout: 'BLOCKED' | 'ALLOWED';
  payoutsAllowed: boolean;
  fiscalPolicy: 'UNCONFIRMED' | 'ACTIVE';
  approvals: EconomicActivationApprovals;
  missing: EconomicActivationRequirementId[];
};

/** Política vigente. Todo requisito externo sigue en falso. */
export const CURRENT_ECONOMIC_ACTIVATION: EconomicActivationApprovals = {
  commission_confirmation: false,
  reward_rules: false,
  fiscal_policy: false,
  tax_documentation: false,
  payment_identity: false,
  fraud_rules: false,
  reversal_behavior: false,
  payout_provider: false,
  reconciliation: false,
  legal_terms: false,
  privacy: false,
  production_monitoring: false,
};

export function evaluateEconomicActivationGate(
  approvals: EconomicActivationApprovals = CURRENT_ECONOMIC_ACTIVATION,
  fiscalPolicy: 'UNCONFIRMED' | 'ACTIVE' = 'UNCONFIRMED',
): EconomicActivationGate {
  const missing = ECONOMIC_ACTIVATION_REQUIREMENTS.filter((id) => approvals[id] !== true);
  const payoutsAllowed = missing.length === 0 && fiscalPolicy === 'ACTIVE';
  return {
    payout: payoutsAllowed ? 'ALLOWED' : 'BLOCKED',
    payoutsAllowed,
    fiscalPolicy,
    approvals,
    missing,
  };
}
