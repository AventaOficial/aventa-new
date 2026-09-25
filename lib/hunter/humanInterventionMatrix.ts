/**
 * Day 4 — Human intervention matrix.
 * AUTO → EXCEPTION QUEUE → HUMAN ONLY WHEN NEEDED.
 * Never auto-publish to inflate automation %.
 */

export type HumanStepId =
  | 'url_paste_discovery'
  | 'moderation_approve'
  | 'moderation_reject'
  | 'dqe_edge_review'
  | 'affiliate_link_repair'
  | 'image_manual_fix'
  | 'category_override'
  | 'money_payout_ops'
  | 'oauth_credential_renewal'
  | 'policy_retailer_enable';

export type HumanStepRow = {
  id: HumanStepId;
  step: string;
  whyHuman: string;
  safetyCritical: boolean;
  canAutomate: 'yes' | 'partial' | 'no';
  confidenceThreshold: string | null;
  exceptionQueue: boolean;
  day4Status: 'removed' | 'required' | 'exception_only' | 'ops_only';
  notes: string;
};

export const HUMAN_INTERVENTION_MATRIX: HumanStepRow[] = [
  {
    id: 'url_paste_discovery',
    step: 'Operator pastes product URLs into env_urls / discovery JSON',
    whyHuman: 'Historical bootstrap when discovery sources empty',
    safetyCritical: false,
    canAutomate: 'yes',
    confidenceThreshold: null,
    exceptionQueue: false,
    day4Status: 'removed',
    notes: 'Day 3 continuous discovery + PM sticky/evidence; env_urls excluded from continuous mode.',
  },
  {
    id: 'moderation_approve',
    step: 'Human approve pending → published',
    whyHuman: 'Publication authority; brand/legal last line',
    safetyCritical: true,
    canAutomate: 'partial',
    confidenceThreshold: 'Only under explicit exception policy — not enabled',
    exceptionQueue: true,
    day4Status: 'required',
    notes: 'Do NOT auto-publish to raise automation_rate. Machine stops at pending.',
  },
  {
    id: 'moderation_reject',
    step: 'Human reject / suppress bad pending',
    whyHuman: 'False positive VERIFIED / policy violations',
    safetyCritical: true,
    canAutomate: 'partial',
    confidenceThreshold: 'Negative memory suppress already auto-blocks known bad',
    exceptionQueue: true,
    day4Status: 'exception_only',
    notes: 'Prefer suppress/negative-memory over every-candidate human review.',
  },
  {
    id: 'dqe_edge_review',
    step: 'Human reviews DQE POTENTIAL / borderline discounts',
    whyHuman: 'Ambiguous habitual savings / artificial list',
    safetyCritical: true,
    canAutomate: 'no',
    confidenceThreshold: 'VERIFIED only via DQE contract; POTENTIAL never auto-mint',
    exceptionQueue: true,
    day4Status: 'exception_only',
    notes: 'Keep POTENTIAL out of S6.1 mint. Exception queue for analyst, not silent upgrade.',
  },
  {
    id: 'affiliate_link_repair',
    step: 'Fix broken affiliate / monetization links',
    whyHuman: 'Network-specific deep links fail intermittently',
    safetyCritical: false,
    canAutomate: 'partial',
    confidenceThreshold: null,
    exceptionQueue: true,
    day4Status: 'exception_only',
    notes: 'Host allowlist + monetization classifier already gate; repairs stay queued.',
  },
  {
    id: 'image_manual_fix',
    step: 'Replace invalid catalog/placeholder images',
    whyHuman: 'Image CDN / catalog gaps',
    safetyCritical: false,
    canAutomate: 'partial',
    confidenceThreshold: 'Fail-closed missing image blocks mint',
    exceptionQueue: true,
    day4Status: 'exception_only',
    notes: 'Machine fails closed on missing image — correct.',
  },
  {
    id: 'category_override',
    step: 'Manual category correction',
    whyHuman: 'ML category drift / bot mis-tag',
    safetyCritical: false,
    canAutomate: 'partial',
    confidenceThreshold: null,
    exceptionQueue: true,
    day4Status: 'exception_only',
    notes: 'Not on critical path for pending mint.',
  },
  {
    id: 'money_payout_ops',
    step: 'Rewards / commissions / settlement ops',
    whyHuman: 'Money movement requires human ops authority',
    safetyCritical: true,
    canAutomate: 'no',
    confidenceThreshold: null,
    exceptionQueue: false,
    day4Status: 'ops_only',
    notes: 'Money paths remain OFF. Never automate for Day 4 KPI.',
  },
  {
    id: 'oauth_credential_renewal',
    step: 'Renew Mercado Libre OAuth when token read fails',
    whyHuman: 'Secret/token ops outside app runtime',
    safetyCritical: true,
    canAutomate: 'partial',
    confidenceThreshold: null,
    exceptionQueue: true,
    day4Status: 'ops_only',
    notes: 'Evidence: ml_api_legacy DEGRADED ML_OAUTH_TOKEN_READ_FAILED. Cron ml-oauth-refresh exists.',
  },
  {
    id: 'policy_retailer_enable',
    step: 'Enable Day-to-Day retailer flags after legal/robots review',
    whyHuman: 'Compliance decision',
    safetyCritical: true,
    canAutomate: 'no',
    confidenceThreshold: null,
    exceptionQueue: false,
    day4Status: 'ops_only',
    notes: 'Walmart/Chedraui adapters exist but DISABLED until policy.',
  },
];

export function remainingHumanRequiredSteps(): HumanStepRow[] {
  return HUMAN_INTERVENTION_MATRIX.filter(
    (r) => r.day4Status === 'required' || r.day4Status === 'exception_only' || r.day4Status === 'ops_only',
  );
}
