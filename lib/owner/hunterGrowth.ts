/**
 * Crecimiento del cazador humano.
 * Las etapas que ya viven en ofertas se leen del informe de oferta humana.
 * La intención solo existe como product_events.hunter_intent y no se publica
 * hasta que ese evento cubre toda la ventana. No calcula cohortes de retorno.
 */
import type { HumanFunnelWindow, HumanSupplyReport } from '@/lib/owner/humanSupply';

export type GrowthCoverage = 'ok' | 'unavailable';

export type HunterAudience = {
  registeredUsers: number | null;
  activeUsers: number | null;
  intentUsers: number | null;
  /** Primera fila hunter_intent, en ms. null si no hay filas o no se pudo leer. */
  intentSinceMs: number | null;
  intentReadable: boolean;
};

export type HunterGrowthWindow = {
  newHunters: number | null;
  firstSubmissions: number | null;
  firstApprovals: number | null;
  secondContributions: number | null;
  repeatHunters: number | null;
  registeredUsers: number | null;
  activeUsers: number | null;
  hunterIntent: number | null;
  userToIntent: number | null;
  intentToSubmission: number | null;
  submissionToApproval: number | null;
  approvalToSecond: number | null;
  humanApprovalRate: number | null;
  humanRejectionRate: number | null;
  intentCoverage: GrowthCoverage;
};

export type HunterGrowthReport = {
  d7: HunterGrowthWindow;
  d30: HunterGrowthWindow;
};

function ratio(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole <= 0 || part > whole) return null;
  return Math.round((part / whole) * 1000) / 1000;
}

function windowMetrics(
  funnel: HumanFunnelWindow | null,
  audience: HunterAudience,
  startMs: number,
): HunterGrowthWindow {
  const covered =
    audience.intentReadable && audience.intentSinceMs != null && audience.intentSinceMs <= startMs;
  const intent = covered ? audience.intentUsers : null;
  return {
    newHunters: funnel?.newContributors ?? null,
    firstSubmissions: funnel?.firstSubmissions ?? null,
    firstApprovals: funnel?.firstApprovals ?? null,
    secondContributions: funnel?.secondContributions ?? null,
    repeatHunters: funnel?.repeatContributors ?? null,
    registeredUsers: audience.registeredUsers,
    activeUsers: audience.activeUsers,
    hunterIntent: intent,
    userToIntent: covered ? ratio(intent, audience.registeredUsers) : null,
    intentToSubmission: covered ? ratio(funnel?.firstSubmissions ?? null, intent) : null,
    submissionToApproval: funnel?.firstHuntSuccessRate ?? null,
    approvalToSecond: ratio(funnel?.secondContributions ?? null, funnel?.firstApprovals ?? null),
    humanApprovalRate: funnel?.approvalRate ?? null,
    humanRejectionRate: funnel?.rejectionRate ?? null,
    intentCoverage: covered ? 'ok' : 'unavailable',
  };
}

export function buildHunterGrowth(input: {
  human: HumanSupplyReport | null;
  d7: HunterAudience;
  d30: HunterAudience;
  d7StartMs: number;
  d30StartMs: number;
}): HunterGrowthReport {
  return {
    d7: windowMetrics(input.human?.d7 ?? null, input.d7, input.d7StartMs),
    d30: windowMetrics(input.human?.d30 ?? null, input.d30, input.d30StartMs),
  };
}
