/**
 * Loader Supabase — solo SELECT, tolerante a tablas/columnas ausentes.
 * Nunca escribe. Nunca llama crons ni providers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fiscalProfileFromRow } from '@/lib/commissions/fiscal';
import { findAllDuplicateRfcs } from '@/lib/server/commissionFiscal';
import type {
  ClawbackRowLite,
  CommissionRowLite,
  IntentRowLite,
  LedgerRowLite,
  PayeeProfileLite,
  PayoutOpsData,
  PayoutRowLite,
  RewardRowLite,
} from './types';

const LIMIT = 2000;

function periodStartIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

type QueryResult<T> = { rows: T[]; available: boolean };

async function safeSelect<T>(
  run: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<QueryResult<T>> {
  try {
    const { data, error } = await run();
    if (error) return { rows: [], available: false };
    return { rows: (data ?? []) as T[], available: true };
  } catch {
    return { rows: [], available: false };
  }
}

const num = (v: unknown): number => Number(v) || 0;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export async function loadPayoutOpsData(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<PayoutOpsData> {
  const nowIso = now.toISOString();
  const periodStart = periodStartIso(now);

  const [ledgerQ, commissionsQ, rewardsQ, intentsQ, payoutsQ, clawbacksQ] = await Promise.all([
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('affiliate_ledger_entries')
        .select(
          'id, amount_cents, status, source, external_ref, notes, meta, tracking_tag, attributable, creator_id, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('affiliate_commissions')
        .select('id, status, gross_commission_cents, ledger_entry_id, source, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('creator_rewards')
        .select(
          'id, creator_id, creator_share_cents, gross_commission_cents, status, hold_until, payout_id, fraud_flags, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('payout_intents')
        .select(
          'id, reward_id, creator_id, amount_cents, status, provider, reserved_at, submitted_at, resolved_at, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('reward_payouts')
        .select('id, user_id, amount_cents, status, paid_at, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
    safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('reward_clawback_adjustments')
        .select('id, reward_id, adjustment_amount_cents, status, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ),
  ]);

  const ledger: LedgerRowLite[] = ledgerQ.rows.map((r) => ({
    id: String(r.id),
    amount_cents: num(r.amount_cents),
    status: String(r.status ?? ''),
    source: str(r.source),
    external_ref: str(r.external_ref),
    notes: str(r.notes),
    meta: r.meta ?? null,
    tracking_tag: str(r.tracking_tag),
    attributable: typeof r.attributable === 'boolean' ? r.attributable : null,
    creator_id: str(r.creator_id),
    created_at: String(r.created_at ?? nowIso),
  }));

  const commissions: CommissionRowLite[] = commissionsQ.rows.map((r) => ({
    id: String(r.id),
    status: String(r.status ?? ''),
    gross_commission_cents: num(r.gross_commission_cents),
    ledger_entry_id: str(r.ledger_entry_id),
    source: str(r.source),
    created_at: String(r.created_at ?? nowIso),
  }));

  const rewards: RewardRowLite[] = rewardsQ.rows.map((r) => ({
    id: String(r.id),
    creator_id: String(r.creator_id ?? ''),
    creator_share_cents: num(r.creator_share_cents),
    gross_commission_cents: num(r.gross_commission_cents),
    status: String(r.status ?? ''),
    hold_until: str(r.hold_until),
    payout_id: str(r.payout_id),
    fraud_flags: r.fraud_flags ?? [],
    created_at: String(r.created_at ?? nowIso),
  }));

  const intents: IntentRowLite[] = intentsQ.rows.map((r) => ({
    id: String(r.id),
    reward_id: String(r.reward_id ?? ''),
    creator_id: String(r.creator_id ?? ''),
    amount_cents: num(r.amount_cents),
    status: String(r.status ?? ''),
    provider: str(r.provider),
    reserved_at: str(r.reserved_at),
    submitted_at: str(r.submitted_at),
    resolved_at: str(r.resolved_at),
    created_at: String(r.created_at ?? nowIso),
  }));

  const payouts: PayoutRowLite[] = payoutsQ.rows.map((r) => ({
    id: String(r.id),
    user_id: String(r.user_id ?? ''),
    amount_cents: num(r.amount_cents),
    status: String(r.status ?? ''),
    paid_at: str(r.paid_at),
    created_at: String(r.created_at ?? nowIso),
  }));

  const clawbacks: ClawbackRowLite[] = clawbacksQ.rows.map((r) => ({
    id: String(r.id),
    reward_id: str(r.reward_id),
    adjustment_amount_cents: num(r.adjustment_amount_cents),
    status: String(r.status ?? ''),
    created_at: String(r.created_at ?? nowIso),
  }));

  const creatorIds = [...new Set(rewards.filter((r) => r.status === 'AVAILABLE').map((r) => r.creator_id))]
    .filter(Boolean)
    .slice(0, 500);

  const profiles = new Map<string, PayeeProfileLite>();
  let duplicateRfcs = new Set<string>();

  if (creatorIds.length > 0) {
    const full = await safeSelect<Record<string, unknown>>(() =>
      supabase
        .from('profiles')
        .select(
          'id, display_name, commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at, rewards_terms_accepted_at, rewards_terms_version, commissions_accepted_at, commissions_terms_version',
        )
        .in('id', creatorIds),
    );
    const rows = full.available
      ? full.rows
      : (
          await safeSelect<Record<string, unknown>>(() =>
            supabase
              .from('profiles')
              .select(
                'id, commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at, commissions_accepted_at, commissions_terms_version',
              )
              .in('id', creatorIds),
          )
        ).rows;

    for (const r of rows) {
      const fiscal = fiscalProfileFromRow(r as Record<string, never>);
      profiles.set(String(r.id), {
        id: String(r.id),
        legalName: fiscal.legalName,
        rfc: fiscal.rfc,
        clabe: fiscal.clabe,
        fiscalUpdatedAt: fiscal.updatedAt,
        termsAcceptedAt: str(r.rewards_terms_accepted_at) ?? str(r.commissions_accepted_at),
        termsVersion: str(r.rewards_terms_version) ?? str(r.commissions_terms_version),
        displayName: str(r.display_name),
      });
    }

    const rfcs = [...profiles.values()].map((p) => p.rfc).filter((x): x is string => !!x);
    if (rfcs.length > 0) {
      try {
        duplicateRfcs = await findAllDuplicateRfcs(supabase, rfcs);
      } catch {
        duplicateRfcs = new Set();
      }
    }
  }

  return {
    now: nowIso,
    periodStart,
    ledger,
    commissions,
    rewards,
    intents,
    payouts,
    clawbacks,
    profiles,
    duplicateRfcs,
    tables: {
      affiliate_ledger_entries: ledgerQ.available,
      affiliate_commissions: commissionsQ.available,
      creator_rewards: rewardsQ.available,
      payout_intents: intentsQ.available,
      reward_payouts: payoutsQ.available,
      reward_clawback_adjustments: clawbacksQ.available,
    },
  };
}
