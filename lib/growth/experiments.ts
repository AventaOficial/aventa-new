export type GrowthExperiment = {
  id: string;
  hypothesis: string;
  surface: string;
  audience: string;
  variable: string;
  primaryMetric: 'confirmed_sales' | 'outbound_conversion' | 'affiliate_conversion' | 'revenue';
  guardrail: 'bounce' | 'quality' | 'rejection_rate' | 'complaints' | 'fraud';
  start: string | null;
  end: string | null;
  result: string | null;
};

export const GROWTH_EXPERIMENTS: readonly GrowthExperiment[] = [];
