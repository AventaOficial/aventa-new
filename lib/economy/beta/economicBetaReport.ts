import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lectura de Economic Beta. No hay ruta pública.
 * El cliente debe ser service_role en el servidor.
 * Cada cifra sale de economic_beta_report().
 */

export type EconomicBetaReport = {
  cohort: 'rewards_beta';
  enrolledUsers: number;
  attributedClicks: number;
  uniqueAttributedClicks: number;
  conversions: number;
  reportedCommissions: number;
  approvedCommissions: number;
  reversedCommissions: number;
  projectedCreatorRewardsCents: number;
  eligibleProjectedRewardsCents: number;
  ineligibleProjections: number;
  attributionFailures: number;
  duplicateConversions: number;
  reversalRate: number | null;
  calculationMismatches: number;
};

export type EconomicBetaReportFilter = {
  userId?: string | null;
  from?: string | null;
  to?: string | null;
};

export const ECONOMIC_BETA_REPORT_SOURCES = {
  enrolledUsers: 'rewards_beta_memberships',
  attributedClicks: 'reward_outbound_clicks',
  uniqueAttributedClicks: 'reward_outbound_clicks.idempotency_key',
  conversions: 'affiliate_conversions',
  reportedCommissions: 'affiliate_commissions.status=reported',
  approvedCommissions: 'affiliate_commissions.status=approved',
  reversedCommissions: 'affiliate_commissions.status=reversed',
  projectedCreatorRewardsCents: 'economic_shadow_projections.projected_creator_cents',
  eligibleProjectedRewardsCents: 'economic_shadow_projections eligibility_status=eligible',
  ineligibleProjections: 'economic_shadow_projections eligibility_status=ineligible',
  attributionFailures: 'affiliate_conversions.attribution_status unattributed|unresolved',
  duplicateConversions: 'economic_order_reconciliation_candidates grouped by explicit key',
  reversalRate: 'reversed / (approved + reversed), null si el denominador es 0',
  calculationMismatches: 'proyección elegible distinta de floor(gross * bps / 10000)',
} as const;

export function reversalRate(approved: number, reversed: number): number | null {
  const denominator = approved + reversed;
  if (denominator === 0) return null;
  return reversed / denominator;
}

export function isEconomicBetaReport(value: unknown): value is EconomicBetaReport {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const numbers = [
    'enrolledUsers',
    'attributedClicks',
    'uniqueAttributedClicks',
    'conversions',
    'reportedCommissions',
    'approvedCommissions',
    'reversedCommissions',
    'projectedCreatorRewardsCents',
    'eligibleProjectedRewardsCents',
    'ineligibleProjections',
    'attributionFailures',
    'duplicateConversions',
    'calculationMismatches',
  ] as const;
  if (row.cohort !== 'rewards_beta') return false;
  if (!numbers.every((key) => typeof row[key] === 'number' && Number.isFinite(row[key] as number))) {
    return false;
  }
  return row.reversalRate === null || typeof row.reversalRate === 'number';
}

export async function loadEconomicBetaReport(
  supabase: SupabaseClient,
  filter: EconomicBetaReportFilter = {},
): Promise<{ ok: true; report: EconomicBetaReport } | { ok: false; reason: string }> {
  const { data, error } = await supabase.rpc('economic_beta_report', {
    p_user_id: filter.userId ?? null,
    p_from: filter.from ?? null,
    p_to: filter.to ?? null,
  });
  if (error) return { ok: false, reason: 'report_unavailable' };
  if (!isEconomicBetaReport(data)) return { ok: false, reason: 'report_shape_invalid' };
  return { ok: true, report: data };
}
