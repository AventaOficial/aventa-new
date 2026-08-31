import type { SupabaseClient } from '@supabase/supabase-js';
import type { AffiliateNetworkId } from '@/lib/rewards/adapters/types';
import { decodeAventaSubId } from '@/lib/rewards/adapters/types';
import { createRewardFromLedgerEntry } from '@/lib/rewards/rewardsEngine';
import { reconcileRewardsForLedgerStatus } from '@/lib/rewards/ledgerReconciliation';

export type LedgerRowForReward = {
  id: string;
  network: AffiliateNetworkId;
  amount_cents: number;
  status: string;
  external_ref?: string | null;
  notes?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string | null;
  tracking_tag?: string | null;
  offer_id?: string | null;
  creator_id?: string | null;
  click_id?: string | null;
};

export async function tryCreateRewardFromLedgerRow(
  supabase: SupabaseClient,
  row: LedgerRowForReward,
): Promise<{ created: boolean; reason?: string; rewardId?: string }> {
  if (row.status === 'void' || row.status === 'reversed') {
    await reconcileRewardsForLedgerStatus(supabase, row.id, null, 'ledger_void_on_import');
    return { created: false, reason: 'commission_void' };
  }

  const tag = row.tracking_tag?.trim() ?? '';
  const subFromTag = decodeAventaSubId(tag);
  const subFromMeta =
    typeof row.meta?.ascsubtag === 'string'
      ? row.meta.ascsubtag
      : typeof row.meta?.sub_id === 'string'
        ? row.meta.sub_id
        : null;

  const result = await createRewardFromLedgerEntry(supabase, {
    id: row.id,
    network: row.network,
    amount_cents: row.amount_cents,
    status: row.status,
    external_ref: row.external_ref,
    notes: row.notes,
    meta: row.meta,
    created_at: row.created_at,
    sub_id_raw: subFromMeta ?? (subFromTag ? tag : null),
    product_hint: row.external_ref,
    offer_id: row.offer_id ?? null,
    creator_id: row.creator_id ?? null,
    click_id: row.click_id ?? null,
  });

  if (result.created) {
    return { created: true, rewardId: result.rewardId };
  }
  return { created: false, reason: result.reason };
}
