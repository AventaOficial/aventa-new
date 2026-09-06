import type { SupabaseClient } from '@supabase/supabase-js';

export const LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD = 'creator_reward' as const;

export type LedgerSettlementChannel = typeof LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD;

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('unique constraint');
}

function isMissingSettlementsTable(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    msg.includes('ledger_settlements') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

/**
 * Claim 1:1 de liquidación sobre un ledger (canal creator_reward).
 * settlement_ref = id preasignado del creator_reward.
 * UNIQUE(ledger_entry_id) es la garantía DB ante concurrencia.
 */
export async function claimCreatorRewardSettlement(
  supabase: SupabaseClient,
  input: { ledgerEntryId: string; rewardId: string },
): Promise<
  | { ok: true }
  | { ok: false; reason: 'already_settled' | 'schema_missing' | 'insert_failed'; message?: string }
> {
  const { error } = await supabase.from('ledger_settlements').insert({
    ledger_entry_id: input.ledgerEntryId,
    channel: LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD,
    settlement_ref: input.rewardId,
  });

  if (!error) return { ok: true };
  if (isMissingSettlementsTable(error)) {
    return { ok: false, reason: 'schema_missing', message: error.message };
  }
  if (isUniqueViolation(error)) {
    return { ok: false, reason: 'already_settled', message: error.message };
  }
  return { ok: false, reason: 'insert_failed', message: error.message };
}

/** Compensa un claim si el insert del reward falló después. */
export async function releaseCreatorRewardSettlementClaim(
  supabase: SupabaseClient,
  input: { ledgerEntryId: string; rewardId: string },
): Promise<void> {
  await supabase
    .from('ledger_settlements')
    .delete()
    .eq('ledger_entry_id', input.ledgerEntryId)
    .eq('settlement_ref', input.rewardId)
    .eq('channel', LEDGER_SETTLEMENT_CHANNEL_CREATOR_REWARD);
}

export async function listSettledLedgerEntryIds(
  supabase: SupabaseClient,
  ledgerIds: string[],
): Promise<Set<string>> {
  if (ledgerIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from('ledger_settlements')
    .select('ledger_entry_id')
    .in('ledger_entry_id', ledgerIds);
  if (error || !data) return new Set();
  return new Set(
    data.map((r) => String((r as { ledger_entry_id: string }).ledger_entry_id)),
  );
}
