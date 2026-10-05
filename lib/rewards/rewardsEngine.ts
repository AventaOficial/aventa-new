import type { SupabaseClient } from '@supabase/supabase-js';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  splitCommissionCents,
  type RewardStatus,
} from '@/lib/rewards/config';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { BOT_AUTHOR_BLOCKED_REASON, isEconomicallyInertAuthor } from '@/lib/economy/botAuthorFirewall';
import { isOfferParticipatingInRewards } from '@/lib/rewards/offerParticipation';
import {
  resolveCommissionAttribution,
  type LedgerAttributionInput,
} from '@/lib/rewards/attribution/matcher';
import { writeRewardAuditLog } from '@/lib/rewards/audit';
import { flagLedgerPendingStaffReview } from '@/lib/rewards/ledgerReconciliation';
import {
  claimCreatorRewardSettlement,
  LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD,
  releaseCreatorRewardSettlementClaim,
} from '@/lib/rewards/ledgerSettlements';
import { randomUUID } from 'crypto';

export type FraudCheckInput = {
  creatorId: string;
  offerId: string;
  clickerUserId?: string | null;
  /** Si la atribución se basó en un click concreto. */
  clickId?: string | null;
};

export function basicFraudFlags(input: FraudCheckInput): string[] {
  const flags: string[] = [];
  if (input.clickerUserId && input.clickerUserId === input.creatorId) {
    flags.push('self_click');
  }
  // P0-2: click anónimo no es auto-rewardable (comprador legítimo puede existir; no auto-liquidar).
  if (input.clickId && !input.clickerUserId) {
    flags.push('anonymous_click');
  }
  return flags;
}

function holdUntilFromNow(days: number = REWARDS_HOLD_DAYS): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function isMissingRewardsTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return msg.includes('creator_rewards') || msg.includes('does not exist') || msg.includes('schema cache');
}

function isMissingAtomicRewardFunction(error: { code?: string; message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === '42883' ||
    error?.code === 'PGRST202' ||
    msg.includes('create_creator_reward_with_creation_audit') ||
    msg.includes('could not find the function')
  );
}

function manualAttributionReason(ledger: LedgerAttributionInput): string | null {
  const raw = ledger.meta?.manual_attribution;
  if (!raw || typeof raw !== 'object') return null;
  const reason = (raw as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

async function getClickClicker(
  supabase: SupabaseClient,
  clickId: string | null,
): Promise<string | null> {
  if (!clickId) return null;
  const { data } = await supabase
    .from('reward_outbound_clicks')
    .select('clicker_user_id')
    .eq('id', clickId)
    .maybeSingle();
  return (data as { clicker_user_id?: string | null } | null)?.clicker_user_id ?? null;
}

export type CreateRewardResult =
  | { created: true; rewardId: string; status: RewardStatus }
  | { created: false; reason: string; rewardId?: string };

async function resolveExistingReward(
  supabase: SupabaseClient,
  ledger: LedgerAttributionInput,
  actorId: string | null,
): Promise<CreateRewardResult | null> {
  const { data: existing } = await supabase
    .from('creator_rewards')
    .select('id, gross_commission_cents, currency')
    .eq('ledger_entry_id', ledger.id)
    .maybeSingle();
  if (!existing?.id) return null;

  const gross = (existing as { gross_commission_cents?: number }).gross_commission_cents;
  const currency = (existing as { currency?: string | null }).currency;
  if (typeof gross === 'number' && gross !== ledger.amount_cents) {
    return { created: false, reason: 'reward_ledger_mismatch', rewardId: String(existing.id) };
  }
  if (typeof currency === 'string' && currency.trim().toUpperCase() !== 'MXN') {
    return { created: false, reason: 'reward_ledger_mismatch', rewardId: String(existing.id) };
  }
  const certified = await certifyRewardCreationAudit(supabase, String(existing.id), actorId);
  if (!certified.ok) {
    return { created: false, reason: 'audit_append_failed', rewardId: String(existing.id) };
  }
  return { created: false, reason: 'duplicate_ledger', rewardId: String(existing.id) };
}

async function certifyRewardCreationAudit(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string | null,
  detail?: {
    ledgerId: string;
    offerId: string;
    creatorId: string;
    method: string;
    confidence: string;
    manual: boolean;
    holdUntil: string;
    createdAt: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const created = await writeRewardAuditLog(supabase, {
    eventType: 'reward_created',
    actorId,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: null,
    newState: 'VALIDATING',
    metadata: detail
      ? {
          ledger_entry_id: detail.ledgerId,
          offer_id: detail.offerId,
          creator_id: detail.creatorId,
          attribution_method: detail.method,
          attribution_confidence: detail.confidence,
          manual_staff_confirmed: detail.manual,
        }
      : { recovered: true },
  });
  if (!created.ok) return created;
  return writeRewardAuditLog(supabase, {
    eventType: 'reward_validating',
    actorId: null,
    entityType: 'creator_reward',
    entityId: rewardId,
    previousState: 'PENDING',
    newState: 'VALIDATING',
    metadata: detail
      ? { hold_until: detail.holdUntil, created_at: detail.createdAt }
      : { recovered: true },
  });
}

/**
 * Crea recompensa desde una fila de ledger atribuida.
 * No crea si programa inactivo, atribución insuficiente, oferta no participa, o fraude evidente.
 *
 * `force: true` es bypass administrativo de `isRewardsProgramActive` únicamente.
 * NO salta: MONEY_PATH_FROZEN, settlement único (P0-4), self_click, anonymous_click,
 * participación de oferta, ni montos/void. No es ruta normal de eligibility (P0-1).
 */
export async function createRewardFromLedgerEntry(
  supabase: SupabaseClient,
  ledger: LedgerAttributionInput,
  options?: { force?: boolean; manualStaffConfirmed?: boolean; actorId?: string | null },
): Promise<CreateRewardResult> {
  if (ledger.amount_cents <= 0) {
    return { created: false, reason: 'zero_amount' };
  }

  const existingReward = await resolveExistingReward(supabase, ledger, options?.actorId ?? null);
  if (existingReward) return existingReward;

  // Freeze superior a force/programa: no nuevos settlements ni rewards monetizables.
  if (isMoneyPathFrozen()) {
    return { created: false, reason: 'money_path_frozen' };
  }

  if (!options?.force && !isRewardsProgramActive()) {
    return { created: false, reason: 'program_inactive' };
  }

  if (ledger.status === 'void' || ledger.status === 'reversed') {
    return { created: false, reason: 'commission_void' };
  }

  if (options?.manualStaffConfirmed && !options.actorId) {
    return { created: false, reason: 'manual_actor_required' };
  }

  let match: {
    offerId: string;
    creatorId: string;
    clickId: string | null;
    method: 'sub_id' | 'product_click_window' | 'manual';
    confidence: 'high' | 'medium';
  };

  if (options?.manualStaffConfirmed && ledger.offer_id) {
    const { data: offerRow } = await supabase
      .from('offers')
      .select('id, created_by, status')
      .eq('id', ledger.offer_id)
      .maybeSingle();
    const creatorId = (offerRow as { created_by?: string } | null)?.created_by;
    const status = (offerRow as { status?: string } | null)?.status;
    if (!creatorId || (status !== 'approved' && status !== 'published')) {
      return { created: false, reason: 'invalid_manual_offer' };
    }
    if (await isEconomicallyInertAuthor(supabase, creatorId)) {
      return { created: false, reason: BOT_AUTHOR_BLOCKED_REASON };
    }
    match = {
      offerId: ledger.offer_id,
      creatorId,
      clickId: ledger.click_id ?? null,
      method: 'manual',
      confidence: 'high',
    };
  } else {
    const attribution = await resolveCommissionAttribution(supabase, ledger);
    if (!attribution.matched) {
      await supabase
        .from('affiliate_ledger_entries')
        .update({
          attribution_method: 'none',
          attribution_confidence: attribution.confidence,
          attributable: false,
        })
        .eq('id', ledger.id);
      return { created: false, reason: attribution.reason };
    }

    const autoMatch = attribution.match;
    if (autoMatch.confidence === 'low' || autoMatch.confidence === 'none') {
      return { created: false, reason: 'low_confidence' };
    }

    if (autoMatch.confidence === 'medium') {
      await flagLedgerPendingStaffReview(supabase, ledger.id, {
        offerId: autoMatch.offerId,
        creatorId: autoMatch.creatorId,
        method: autoMatch.method,
        confidence: autoMatch.confidence,
        clickId: autoMatch.clickId,
      });
      return { created: false, reason: 'pending_staff_review' };
    }

    match = {
      offerId: autoMatch.offerId,
      creatorId: autoMatch.creatorId,
      clickId: autoMatch.clickId,
      method: autoMatch.method,
      confidence: 'high',
    };
  }

  const participating = await isOfferParticipatingInRewards(supabase, match.offerId);
  if (!participating) {
    return { created: false, reason: 'offer_not_participating' };
  }

  const clickerUserId = await getClickClicker(supabase, match.clickId);
  const fraudFlags = basicFraudFlags({
    creatorId: match.creatorId,
    offerId: match.offerId,
    clickerUserId,
    clickId: match.clickId,
  });
  if (fraudFlags.includes('self_click')) {
    return { created: false, reason: 'fraud_self_click' };
  }
  if (fraudFlags.includes('anonymous_click')) {
    return { created: false, reason: 'anonymous_click_not_auto_rewardable' };
  }

  const { creatorCents, platformCents } = splitCommissionCents(
    ledger.amount_cents,
    REWARDS_CREATOR_SHARE_BPS,
  );
  if (creatorCents <= 0) {
    return { created: false, reason: 'zero_creator_share' };
  }

  const holdUntil = holdUntilFromNow();
  const now = new Date().toISOString();
  // Preasignar id: settlement_ref = reward.id (claim 1:1 antes del insert monetario).
  let rewardId: string = randomUUID();
  let resumedClaim = false;

  const claim = await claimCreatorRewardSettlement(supabase, {
    ledgerEntryId: ledger.id,
    rewardId,
  });
  if (!claim.ok) {
    if (claim.reason === 'already_settled') {
      const raced = await resolveExistingReward(supabase, ledger, options?.actorId ?? null);
      if (raced) return raced;
      const { data: claimRow, error: claimReadError } = await supabase
        .from('ledger_settlements')
        .select('settlement_ref')
        .eq('ledger_entry_id', ledger.id)
        .eq('channel', LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD)
        .maybeSingle();
      const resumeId = (claimRow as { settlement_ref?: string } | null)?.settlement_ref;
      if (claimReadError || !resumeId) {
        return { created: false, reason: 'settlement_claim_failed' };
      }
      rewardId = String(resumeId);
      resumedClaim = true;
    } else if (claim.reason === 'schema_missing') {
      return { created: false, reason: 'schema_missing' };
    } else {
      console.error('[rewards/create] settlement claim failed:', claim.message);
      return { created: false, reason: 'settlement_claim_failed' };
    }
  }

  const { data: createdRewardId, error } = await supabase.rpc(
    'create_creator_reward_with_creation_audit',
    {
      p_payload: {
        id: rewardId,
        creator_id: match.creatorId,
        offer_id: match.offerId,
        ledger_entry_id: ledger.id,
        network: ledger.network,
        gross_commission_cents: ledger.amount_cents,
        creator_share_cents: creatorCents,
        platform_share_cents: platformCents,
        creator_share_bps: REWARDS_CREATOR_SHARE_BPS,
        currency: 'MXN',
        attribution_method: match.method,
        attribution_confidence: match.confidence,
        hold_until: holdUntil,
        created_at: now,
        fraud_flags: fraudFlags,
        meta: { click_id: match.clickId },
        actor_id: options?.actorId ?? null,
        audit_metadata: {
          ledger_entry_id: ledger.id,
          offer_id: match.offerId,
          creator_id: match.creatorId,
          attribution_method: match.method,
          attribution_confidence: match.confidence,
          manual_staff_confirmed: Boolean(options?.manualStaffConfirmed),
          manual_actor_id: options?.actorId ?? null,
          manual_reason: manualAttributionReason(ledger),
          confirmed_at: options?.manualStaffConfirmed ? now : null,
        },
      },
    },
  );

  if (error || !createdRewardId) {
    const rpcError = error ?? { code: '', message: 'reward_creation_audit_failed' };
    if (isMissingAtomicRewardFunction(rpcError) || isMissingRewardsTable(rpcError)) {
      if (!resumedClaim) {
        await releaseCreatorRewardSettlementClaim(supabase, {
          ledgerEntryId: ledger.id,
          rewardId,
        });
      }
      return { created: false, reason: 'schema_missing' };
    }
    const msg = (rpcError.message ?? '').toLowerCase();
    if (msg.includes('reward_creation_audit_failed')) {
      return { created: false, reason: 'audit_append_failed' };
    }
    if (rpcError.code === '23505' || msg.includes('duplicate key') || msg.includes('unique')) {
      const raced = await resolveExistingReward(supabase, ledger, options?.actorId ?? null);
      if (raced) return raced;
      return { created: false, reason: 'insert_failed' };
    }
    if (!resumedClaim) {
      await releaseCreatorRewardSettlementClaim(supabase, {
        ledgerEntryId: ledger.id,
        rewardId,
      });
    }
    console.error('[rewards/create]', rpcError.message);
    return { created: false, reason: 'insert_failed' };
  }

  await supabase
    .from('affiliate_ledger_entries')
    .update({
      offer_id: match.offerId,
      creator_id: match.creatorId,
      click_id: match.clickId,
      attribution_method: match.method,
      attribution_confidence: match.confidence,
      attributable: true,
    })
    .eq('id', ledger.id);

  return { created: true, rewardId: String(createdRewardId), status: 'VALIDATING' };
}

/** Mueve recompensas VALIDATING → AVAILABLE cuando venció el hold.
 * Autoridad canónica única (CAS status=VALIDATING + hold_until<=now).
 * Bounded batch via existing idx_creator_rewards_hold (status, hold_until).
 * Never creates payout / payout_intent. Never VALIDATING→PAID.
 */
export type ProcessExpiredRewardHoldsOptions = {
  /** Max rows to attempt this run (default 200). */
  limit?: number;
};

export type RewardMutationResult =
  | { ok: true; rewardId: string }
  | { ok: false; reason: string; rewardId?: string };

export type ProcessExpiredRewardHoldsResult = {
  processed: number;
  scanned: number;
  frozen?: boolean;
  releasedIds: string[];
  certifiedIds: string[];
  auditFailedIds: string[];
};

async function findRewardAudit(
  supabase: SupabaseClient,
  rewardId: string,
  eventType: string,
): Promise<'present' | 'absent' | 'unknown'> {
  const { data, error } = await supabase
    .from('reward_audit_log')
    .select('id')
    .eq('entity_type', 'creator_reward')
    .eq('entity_id', rewardId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle();
  if (error) return 'unknown';
  return (data as { id?: string } | null)?.id ? 'present' : 'absent';
}

async function appendMandatoryRewardAudit(
  supabase: SupabaseClient,
  input: {
    rewardId: string;
    eventType: string;
    actorId: string | null;
    previousState: string;
    newState: string;
    metadata: Record<string, unknown>;
  },
): Promise<RewardMutationResult> {
  const written = await writeRewardAuditLog(supabase, {
    eventType: input.eventType,
    actorId: input.actorId,
    entityType: 'creator_reward',
    entityId: input.rewardId,
    previousState: input.previousState,
    newState: input.newState,
    metadata: input.metadata,
  });
  if (!written.ok) {
    return { ok: false, reason: 'audit_append_failed', rewardId: input.rewardId };
  }
  return { ok: true, rewardId: input.rewardId };
}

/** Si el estado destino ya está escrito, solo certifica. No vuelve a mutar. */
async function certifyExistingRewardTransition(
  supabase: SupabaseClient,
  input: {
    rewardId: string;
    eventType: string;
    actorId: string | null;
    state: string;
    metadata: Record<string, unknown>;
  },
): Promise<RewardMutationResult> {
  const presence = await findRewardAudit(supabase, input.rewardId, input.eventType);
  if (presence === 'present') {
    return { ok: false, reason: 'already_terminal', rewardId: input.rewardId };
  }
  if (presence === 'unknown') {
    return { ok: false, reason: 'audit_append_failed', rewardId: input.rewardId };
  }
  return appendMandatoryRewardAudit(supabase, {
    rewardId: input.rewardId,
    eventType: input.eventType,
    actorId: input.actorId,
    previousState: input.state,
    newState: input.state,
    metadata: { ...input.metadata, recovered: true },
  });
}

async function certifyAvailableHoldsMissingAudit(
  supabase: SupabaseClient,
  limit: number,
  now: string,
): Promise<{ certifiedIds: string[]; auditFailedIds: string[] }> {
  const { data: rows, error } = await supabase
    .from('creator_rewards')
    .select('id, status, hold_until')
    .eq('status', 'AVAILABLE')
    .lte('hold_until', now)
    .order('hold_until', { ascending: true })
    .limit(limit);

  if (error || !rows?.length) return { certifiedIds: [], auditFailedIds: [] };

  const certifiedIds: string[] = [];
  const auditFailedIds: string[] = [];
  for (const row of rows) {
    const id = String((row as { id: string }).id);
    const certified = await certifyExistingRewardTransition(supabase, {
      rewardId: id,
      eventType: 'reward_available',
      actorId: null,
      state: 'AVAILABLE',
      metadata: { available_at: now, source: 'process_expired_holds' },
    });
    if (certified.ok) certifiedIds.push(id);
    else if (certified.reason === 'audit_append_failed') auditFailedIds.push(id);
  }
  return { certifiedIds, auditFailedIds };
}

export async function processExpiredRewardHolds(
  supabase: SupabaseClient,
  options: ProcessExpiredRewardHoldsOptions = {},
): Promise<ProcessExpiredRewardHoldsResult> {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
  const now = new Date().toISOString();

  if (isMoneyPathFrozen()) {
    return {
      processed: 0,
      scanned: 0,
      frozen: true,
      releasedIds: [],
      certifiedIds: [],
      auditFailedIds: [],
    };
  }

  const { data: rows, error } = await supabase
    .from('creator_rewards')
    .select('id, status, hold_until')
    .eq('status', 'VALIDATING')
    .lte('hold_until', now)
    .order('hold_until', { ascending: true })
    .limit(limit);

  const releasedIds: string[] = [];
  const auditFailedIds: string[] = [];
  const scanned = error || !rows?.length ? 0 : rows.length;

  for (const row of rows ?? []) {
    const id = (row as { id: string }).id;
    const { data: updated, error: upd } = await supabase
      .from('creator_rewards')
      .update({
        status: 'AVAILABLE',
        available_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'VALIDATING')
      .lte('hold_until', now)
      .select('id')
      .maybeSingle();

    if (upd) {
      console.error('[rewards/processHolds] update failed', id, upd.message);
      continue;
    }
    if (!updated?.id) {
      // Lost CAS race or hold extended — idempotent skip. The winner audits.
      continue;
    }

    const certified = await appendMandatoryRewardAudit(supabase, {
      rewardId: id,
      eventType: 'reward_available',
      actorId: null,
      previousState: 'VALIDATING',
      newState: 'AVAILABLE',
      metadata: { available_at: now, source: 'process_expired_holds' },
    });
    if (!certified.ok) {
      auditFailedIds.push(id);
      continue;
    }
    releasedIds.push(id);
  }

  const recovered = await certifyAvailableHoldsMissingAudit(supabase, limit, now);
  const failed = new Set([...auditFailedIds, ...recovered.auditFailedIds]);
  for (const id of recovered.certifiedIds) failed.delete(id);

  return {
    processed: releasedIds.length,
    scanned,
    releasedIds,
    certifiedIds: recovered.certifiedIds.filter((id) => !releasedIds.includes(id)),
    auditFailedIds: [...failed],
  };
}

/** Estados que cancelReward puede transicionar a CANCELLED (CAS en UPDATE). */
const CANCEL_REWARD_ALLOWED_STATUSES = ['PENDING', 'VALIDATING', 'AVAILABLE'] as const;

export async function cancelReward(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string,
  reason: string,
): Promise<RewardMutationResult> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from('creator_rewards')
    .select('status')
    .eq('id', rewardId)
    .maybeSingle();
  const prev = (row as { status?: string } | null)?.status;
  if (!prev) return { ok: false, reason: 'not_found', rewardId };
  if (prev === 'PAID' || prev === 'REVERSED') {
    return { ok: false, reason: 'terminal_status', rewardId };
  }
  if (prev === 'CANCELLED') {
    return certifyExistingRewardTransition(supabase, {
      rewardId,
      eventType: 'reward_cancelled',
      actorId,
      state: 'CANCELLED',
      metadata: { reason },
    });
  }
  if (isMoneyPathFrozen()) return { ok: false, reason: 'money_path_frozen', rewardId };

  // CAS: la autoridad es el UPDATE; el SELECT previo no protege concurrencia.
  const { data: updated, error } = await supabase
    .from('creator_rewards')
    .update({ status: 'CANCELLED', cancelled_at: now, updated_at: now })
    .eq('id', rewardId)
    .in('status', [...CANCEL_REWARD_ALLOWED_STATUSES])
    .select('id')
    .maybeSingle();

  if (error || !(updated as { id?: string } | null)?.id) {
    return { ok: false, reason: 'cas_lost', rewardId };
  }

  return appendMandatoryRewardAudit(supabase, {
    rewardId,
    eventType: 'reward_cancelled',
    actorId,
    previousState: prev,
    newState: 'CANCELLED',
    metadata: { reason },
  });
}

export async function reverseReward(
  supabase: SupabaseClient,
  rewardId: string,
  actorId: string,
  reason: string,
): Promise<RewardMutationResult> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from('creator_rewards')
    .select('status')
    .eq('id', rewardId)
    .maybeSingle();
  const prev = (row as { status?: string } | null)?.status;
  if (!prev) return { ok: false, reason: 'not_found', rewardId };
  if (prev === 'PAID' || prev === 'CANCELLED') {
    return { ok: false, reason: 'terminal_status', rewardId };
  }
  if (prev === 'REVERSED') {
    return certifyExistingRewardTransition(supabase, {
      rewardId,
      eventType: 'reward_reversed',
      actorId,
      state: 'REVERSED',
      metadata: { reason },
    });
  }
  if (isMoneyPathFrozen()) return { ok: false, reason: 'money_path_frozen', rewardId };

  const { data: updated, error } = await supabase
    .from('creator_rewards')
    .update({ status: 'REVERSED', reversed_at: now, updated_at: now })
    .eq('id', rewardId)
    .eq('status', prev)
    .select('id')
    .maybeSingle();

  if (error || !(updated as { id?: string } | null)?.id) {
    return { ok: false, reason: 'cas_lost', rewardId };
  }

  return appendMandatoryRewardAudit(supabase, {
    rewardId,
    eventType: 'reward_reversed',
    actorId,
    previousState: prev,
    newState: 'REVERSED',
    metadata: { reason },
  });
}

export type UserRewardBalances = {
  validatingCents: number;
  availableCents: number;
  paidCents: number;
  cancelledCents: number;
  reversedCents: number;
};

export async function getUserRewardBalances(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRewardBalances> {
  const empty: UserRewardBalances = {
    validatingCents: 0,
    availableCents: 0,
    paidCents: 0,
    cancelledCents: 0,
    reversedCents: 0,
  };

  const { data, error } = await supabase
    .from('creator_rewards')
    .select('creator_share_cents, status')
    .eq('creator_id', userId);

  if (error) return empty;

  const balances = { ...empty };
  for (const row of data ?? []) {
    const cents = Number((row as { creator_share_cents?: number }).creator_share_cents ?? 0);
    const status = (row as { status?: string }).status;
    if (status === 'PENDING' || status === 'VALIDATING') balances.validatingCents += cents;
    else if (status === 'AVAILABLE') balances.availableCents += cents;
    else if (status === 'PAID') balances.paidCents += cents;
    else if (status === 'CANCELLED') balances.cancelledCents += cents;
    else if (status === 'REVERSED') balances.reversedCents += cents;
  }
  return balances;
}
