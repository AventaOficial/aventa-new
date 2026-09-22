/**
 * Centro de Pagos — contratos.
 * SoT: docs/SYSTEMS/SYSTEM_payout_operations.md
 * Solo lectura: ningún tipo aquí representa una acción que mueva dinero.
 */

export type AutomationLevel = 'auto' | 'semi' | 'manual' | 'blocked';

export type StageId = 'ingest' | 'split' | 'hold' | 'batch' | 'disburse' | 'reconcile';

export type StageActor = 'sistema' | 'finance' | 'owner' | 'externo';

export type StageMetric = { label: string; value: string; hint?: string };

export type PipelineStage = {
  id: StageId;
  order: number;
  title: string;
  /** Pregunta que se hace el dueño en esta caja. */
  question: string;
  actor: StageActor;
  automation: AutomationLevel;
  automationReason: string;
  /** Qué hace falta para subir de nivel. */
  nextUnlock: string;
  /** ¿Está corriendo hoy (flags/cron) o solo existe como código? */
  live: boolean;
  metrics: StageMetric[];
};

export type PayeeGateCode =
  | 'below_minimum'
  | 'fiscal_incomplete'
  | 'clabe_missing'
  | 'clabe_invalid'
  | 'terms_missing'
  | 'terms_outdated'
  | 'rfc_duplicate'
  | 'clawback_pending'
  | 'fraud_flags'
  | 'first_payout'
  | 'bank_details_changed';

export type PayeeGateDecision = 'pass' | 'review' | 'fail' | 'carry';

export type PayeeGateResult = {
  decision: PayeeGateDecision;
  codes: PayeeGateCode[];
  reasons: string[];
};

export type PayeeGateInput = {
  amountCents: number;
  minPayoutCents: number;
  legalName: string | null;
  rfc: string | null;
  clabe: string | null;
  fiscalUpdatedAt: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  requiredTermsVersion: string;
  priorPaidCount: number;
  lastPaidAt: string | null;
  fraudFlags: string[];
  pendingClawbackCents: number;
  rfcDuplicate: boolean;
};

export type BatchPayeeLine = {
  creatorId: string;
  displayName: string | null;
  amountCents: number;
  rewardCount: number;
  rewardIds: string[];
  gate: PayeeGateResult;
};

export type BatchTotals = {
  payableCents: number;
  payableCount: number;
  reviewCents: number;
  reviewCount: number;
  blockedCents: number;
  blockedCount: number;
  carryCents: number;
  carryCount: number;
  inFlightCents: number;
  inFlightCount: number;
};

export type BatchPreview = {
  periodLabel: string;
  minPayoutCents: number;
  lines: BatchPayeeLine[];
  totals: BatchTotals;
  readyToRelease: boolean;
  releaseBlockers: string[];
};

export type ExceptionKind =
  | 'intent_failed'
  | 'intent_unknown'
  | 'intent_stale'
  | 'reward_fraud_flags'
  | 'clawback_pending'
  | 'payee_gate_fail'
  | 'payee_gate_review'
  | 'ledger_unattributed'
  | 'ledger_synthetic';

export type ExceptionSeverity = 'critical' | 'attention' | 'info';

export type ExceptionItem = {
  id: string;
  kind: ExceptionKind;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  amountCents: number | null;
  owner: StageActor;
  href: string | null;
};

export type RunbookStatus = 'done' | 'pending' | 'blocked' | 'na';

export type RunbookStep = {
  id: string;
  order: number;
  title: string;
  description: string;
  actor: StageActor;
  status: RunbookStatus;
  detail: string;
  href: string | null;
};

export type AutomationScore = {
  internalPct: number;
  endToEndPct: number;
  byStage: Record<StageId, AutomationLevel>;
  explanation: string[];
};

export type PayoutProviderMode =
  | 'none'
  | 'stub'
  | 'sandbox'
  | 'manual_spei'
  | 'real'
  | 'forbidden_production'
  | 'invalid';

export type PayoutOpsRuntime = {
  productionRuntime: boolean;
  moneyPathFrozen: boolean;
  settlementBridgeEnabled: boolean;
  rewardsProgramActive: boolean;
  payoutProvider: { configured: string | null; mode: PayoutProviderMode; detail: string };
  activationVerdict: 'READY_FOR_CONTROLLED_ACTIVATION' | 'NOT_READY' | 'SAFE_FROZEN';
  remainingBlockers: string[];
};

/** Datos crudos normalizados (independientes de Supabase) que alimentan el snapshot. */
export type PayoutOpsData = {
  now: string;
  periodStart: string;
  ledger: LedgerRowLite[];
  commissions: CommissionRowLite[];
  rewards: RewardRowLite[];
  intents: IntentRowLite[];
  payouts: PayoutRowLite[];
  clawbacks: ClawbackRowLite[];
  profiles: Map<string, PayeeProfileLite>;
  duplicateRfcs: Set<string>;
  tables: Record<string, boolean>;
};

export type LedgerRowLite = {
  id: string;
  amount_cents: number;
  status: string;
  source: string | null;
  external_ref: string | null;
  notes: string | null;
  meta: unknown;
  tracking_tag: string | null;
  attributable: boolean | null;
  creator_id: string | null;
  created_at: string;
};

export type CommissionRowLite = {
  id: string;
  status: string;
  gross_commission_cents: number;
  ledger_entry_id: string | null;
  source: string | null;
  created_at: string;
};

export type RewardRowLite = {
  id: string;
  creator_id: string;
  creator_share_cents: number;
  gross_commission_cents: number;
  status: string;
  hold_until: string | null;
  payout_id: string | null;
  fraud_flags: unknown;
  created_at: string;
};

export type IntentRowLite = {
  id: string;
  reward_id: string;
  creator_id: string;
  amount_cents: number;
  status: string;
  provider: string | null;
  reserved_at: string | null;
  submitted_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type PayoutRowLite = {
  id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  created_at: string;
};

export type ClawbackRowLite = {
  id: string;
  reward_id: string | null;
  adjustment_amount_cents: number;
  status: string;
  created_at: string;
};

export type PayeeProfileLite = {
  id: string;
  legalName: string | null;
  rfc: string | null;
  clabe: string | null;
  fiscalUpdatedAt: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  displayName: string | null;
};

export type AutoReleaseSummary = {
  enabled: boolean;
  eligible: boolean;
  blockers: string[];
  policy: string[];
};

export type PayoutOpsSnapshot = {
  generatedAt: string;
  role: string;
  runtime: PayoutOpsRuntime;
  config: { creatorShareBps: number; minPayoutCents: number; holdDays: number; termsVersion: string };
  stages: PipelineStage[];
  score: AutomationScore;
  runbook: RunbookStep[];
  batch: BatchPreview;
  exceptions: ExceptionItem[];
  autoRelease: AutoReleaseSummary;
  tables: Record<string, boolean>;
};
