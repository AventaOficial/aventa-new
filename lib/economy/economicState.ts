/**
 * Estado económico canónico para el CEO.
 * Listo significa que la infraestructura existe. No significa que se pueda pagar.
 */

import { evaluateEconomicActivationGate } from './activation/economicActivationGate';
import { CURRENT_FISCAL_POLICY } from './fiscal/fiscalPolicy';

export type EconomicState = {
  infrastructureReady: boolean;
  fiscalPolicyStatus: 'UNCONFIRMED' | 'ACTIVE';
  payoutStatus: 'FROZEN' | 'ALLOWED';
  providerStatus: 'SANDBOX' | 'PRODUCTION';
};

export function readEconomicState(): EconomicState {
  const gate = evaluateEconomicActivationGate();
  const fiscalActive = CURRENT_FISCAL_POLICY.status === 'ACTIVE' && gate.fiscalPolicy === 'ACTIVE';
  const allowed = gate.payoutsAllowed && fiscalActive;
  return {
    infrastructureReady: true,
    fiscalPolicyStatus: fiscalActive ? 'ACTIVE' : 'UNCONFIRMED',
    payoutStatus: allowed ? 'ALLOWED' : 'FROZEN',
    providerStatus: allowed ? 'PRODUCTION' : 'SANDBOX',
  };
}
