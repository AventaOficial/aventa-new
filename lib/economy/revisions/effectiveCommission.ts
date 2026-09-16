/**
 * Effective commission amount = original gross + recorded revisions in order.
 * Original row is never overwritten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type EffectiveCommissionSnapshot = {
  commissionId: string;
  originalGrossCents: number;
  currency: string;
  effectiveCents: number;
  revisionCount: number;
};

type RevisionRow = {
  semantics: string;
  amount_delta_cents: number | null;
  absolute_amount_cents: number | null;
  status: string;
};

export function applyRevisionsToGross(
  originalGrossCents: number,
  revisions: RevisionRow[],
): number {
  let effective = originalGrossCents;
  for (const r of revisions) {
    if (r.status !== 'recorded') continue;
    if (r.semantics === 'replacement' && r.absolute_amount_cents != null) {
      effective = r.absolute_amount_cents;
    } else if (r.semantics === 'delta' && r.amount_delta_cents != null) {
      effective += r.amount_delta_cents;
    }
  }
  return effective;
}

export async function computeEffectiveCommissionCents(
  supabase: SupabaseClient,
  commissionId: string,
): Promise<number | null> {
  const { data: commission, error } = await supabase
    .from('affiliate_commissions')
    .select('id, gross_commission_cents, currency')
    .eq('id', commissionId)
    .maybeSingle();
  if (error || !commission?.id) return null;

  const { data: revisions, error: rErr } = await supabase
    .from('affiliate_commission_revisions')
    .select('semantics, amount_delta_cents, absolute_amount_cents, status, occurred_at, created_at')
    .eq('commission_id', commissionId)
    .order('occurred_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (rErr) return null;

  return applyRevisionsToGross(
    Number(commission.gross_commission_cents),
    (revisions ?? []) as RevisionRow[],
  );
}

export async function getEffectiveCommissionSnapshot(
  supabase: SupabaseClient,
  commissionId: string,
): Promise<EffectiveCommissionSnapshot | null> {
  const { data: commission, error } = await supabase
    .from('affiliate_commissions')
    .select('id, gross_commission_cents, currency')
    .eq('id', commissionId)
    .maybeSingle();
  if (error || !commission?.id) return null;

  const { data: revisions } = await supabase
    .from('affiliate_commission_revisions')
    .select('semantics, amount_delta_cents, absolute_amount_cents, status, occurred_at, created_at')
    .eq('commission_id', commissionId)
    .order('occurred_at', { ascending: true })
    .order('created_at', { ascending: true });

  const rows = (revisions ?? []) as RevisionRow[];
  return {
    commissionId: String(commission.id),
    originalGrossCents: Number(commission.gross_commission_cents),
    currency: String(commission.currency ?? 'MXN'),
    effectiveCents: applyRevisionsToGross(Number(commission.gross_commission_cents), rows),
    revisionCount: rows.filter((r) => r.status === 'recorded').length,
  };
}
