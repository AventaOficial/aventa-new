/**
 * Política fiscal ejecutable. No es una opinión legal.
 * La política de producción permanece UNCONFIRMED: no hay tasa universal.
 */

export type FiscalPolicyStatus = 'UNCONFIRMED' | 'ACTIVE' | 'RETIRED';

export type FiscalPolicyVersion = {
  id: string;
  effectiveFrom: string | null;
  jurisdiction: string;
  recipientType: string;
  activityClassification: string;
  status: FiscalPolicyStatus;
  /** Basis points. null = la política no fija retención. */
  withholdingBps: number | null;
  /** Basis points de ajuste explícito. null = sin ajuste. */
  adjustmentBps: number | null;
  documentation: readonly string[];
  payoutRequirements: readonly string[];
};

export const CURRENT_FISCAL_POLICY: FiscalPolicyVersion = {
  id: 'mx-unconfirmed',
  effectiveFrom: null,
  jurisdiction: 'MX',
  recipientType: 'UNCLASSIFIED',
  activityClassification: 'UNCONFIRMED',
  status: 'UNCONFIRMED',
  withholdingBps: null,
  adjustmentBps: null,
  documentation: ['Pendiente de confirmación externa. No se recolectan datos fiscales todavía.'],
  payoutRequirements: ['Política fiscal confirmada', 'Compuerta de activación completa'],
};

export type FiscalScenarioId = 'SCENARIO_A' | 'SCENARIO_B' | 'SCENARIO_C';

export type FiscalScenario = {
  id: FiscalScenarioId;
  label: 'PF_RESICO' | 'PF_ACTIVIDAD_EMPRESARIAL' | 'PM_RESICO';
  presentation: 'SIMULATED';
  legalStatus: 'NOT_A_LEGAL_OPINION';
  withholdingBps: null;
  documentation: readonly string[];
};

/** Escenarios nombrados para comparar. Ninguno está activo ni trae una tasa. */
export const FISCAL_SCENARIOS: readonly FiscalScenario[] = [
  {
    id: 'SCENARIO_A',
    label: 'PF_RESICO',
    presentation: 'SIMULATED',
    legalStatus: 'NOT_A_LEGAL_OPINION',
    withholdingBps: null,
    documentation: ['Régimen, RFC y comprobante: pendientes de política confirmada.'],
  },
  {
    id: 'SCENARIO_B',
    label: 'PF_ACTIVIDAD_EMPRESARIAL',
    presentation: 'SIMULATED',
    legalStatus: 'NOT_A_LEGAL_OPINION',
    withholdingBps: null,
    documentation: ['Régimen, RFC y comprobante: pendientes de política confirmada.'],
  },
  {
    id: 'SCENARIO_C',
    label: 'PM_RESICO',
    presentation: 'SIMULATED',
    legalStatus: 'NOT_A_LEGAL_OPINION',
    withholdingBps: null,
    documentation: ['Régimen, RFC y comprobante: pendientes de política confirmada.'],
  },
];

export function selectFiscalPolicy(
  policies: readonly FiscalPolicyVersion[],
  at: Date,
): FiscalPolicyVersion {
  const active = policies
    .filter((policy) => policy.status === 'ACTIVE' && policy.effectiveFrom)
    .filter((policy) => Date.parse(policy.effectiveFrom as string) <= at.getTime())
    .sort((a, b) => Date.parse(b.effectiveFrom as string) - Date.parse(a.effectiveFrom as string));
  return active[0] ?? CURRENT_FISCAL_POLICY;
}
