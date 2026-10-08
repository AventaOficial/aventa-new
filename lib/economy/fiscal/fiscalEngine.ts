/**
 * Ejecuta una política fiscal ya configurada.
 * Una política UNCONFIRMED no produce neto pagable.
 */

import {
  CURRENT_FISCAL_POLICY,
  FISCAL_SCENARIOS,
  type FiscalPolicyVersion,
  type FiscalScenario,
} from './fiscalPolicy';

export type FiscalPresentation = 'SIMULATED' | 'ACTIVE_POLICY';

export type FiscalExecution = {
  presentation: FiscalPresentation;
  policyId: string;
  grossCents: number;
  withholdingCents: number | null;
  adjustmentCents: number | null;
  netPayableCents: number | null;
  reason: 'policy_unconfirmed' | 'policy_incomplete' | 'calculated' | 'invalid_gross';
};

export type FiscalScenarioComparison = {
  scenario: FiscalScenario;
  grossCents: number;
  withholdingCents: null;
  estimatedNetCents: null;
  documentation: readonly string[];
};

function bpsOf(grossCents: number, bps: number): number {
  return Math.floor((grossCents * bps) / 10_000);
}

export function executeFiscalPolicy(
  grossCents: number,
  policy: FiscalPolicyVersion = CURRENT_FISCAL_POLICY,
): FiscalExecution {
  const gross = Math.floor(grossCents);
  if (!Number.isInteger(gross) || gross < 0) {
    return {
      presentation: policy.status === 'ACTIVE' ? 'ACTIVE_POLICY' : 'SIMULATED',
      policyId: policy.id,
      grossCents: 0,
      withholdingCents: null,
      adjustmentCents: null,
      netPayableCents: null,
      reason: 'invalid_gross',
    };
  }
  if (policy.status !== 'ACTIVE') {
    return {
      presentation: 'SIMULATED',
      policyId: policy.id,
      grossCents: gross,
      withholdingCents: null,
      adjustmentCents: null,
      netPayableCents: null,
      reason: 'policy_unconfirmed',
    };
  }
  if (policy.withholdingBps == null || policy.adjustmentBps == null) {
    return {
      presentation: 'ACTIVE_POLICY',
      policyId: policy.id,
      grossCents: gross,
      withholdingCents: null,
      adjustmentCents: null,
      netPayableCents: null,
      reason: 'policy_incomplete',
    };
  }
  const withholdingCents = bpsOf(gross, policy.withholdingBps);
  const adjustmentCents = bpsOf(gross, policy.adjustmentBps);
  return {
    presentation: 'ACTIVE_POLICY',
    policyId: policy.id,
    grossCents: gross,
    withholdingCents,
    adjustmentCents,
    netPayableCents: gross - withholdingCents - adjustmentCents,
    reason: 'calculated',
  };
}

export function compareFiscalScenarios(grossCents: number): FiscalScenarioComparison[] {
  const gross = Math.max(0, Math.floor(grossCents));
  return FISCAL_SCENARIOS.map((scenario) => ({
    scenario,
    grossCents: gross,
    withholdingCents: null,
    estimatedNetCents: null,
    documentation: scenario.documentation,
  }));
}
