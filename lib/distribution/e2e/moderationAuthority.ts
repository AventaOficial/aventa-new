/**
 * Harness moderation authority — mirrors moderate-offer status gate only.
 * pending → approved | rejected. No email, rewards, distribution side-effects here
 * (caller invokes enqueue explicitly after approve, like production fire-and-forget).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type HarnessModerationResult =
  | { ok: true; previousStatus: 'pending'; status: 'approved' | 'rejected' }
  | { ok: false; reason: string; currentStatus?: string };

/**
 * Server-authoritative moderation transition for E2E.
 * Same invariant as moderate-offer: only pending can be moderated.
 */
export async function applyHarnessModerationDecision(
  supabase: SupabaseClient,
  input: {
    offerId: string;
    decision: 'approved' | 'rejected';
    nowMs?: number;
  },
): Promise<HarnessModerationResult> {
  const { data: row, error } = await supabase
    .from('offers')
    .select('id, status')
    .eq('id', input.offerId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };
  if (!row) return { ok: false, reason: 'offer_not_found' };

  const current = String((row as { status?: string }).status ?? '').toLowerCase();
  if (current === input.decision) {
    return { ok: true, previousStatus: 'pending', status: input.decision };
  }
  if (current !== 'pending') {
    return { ok: false, reason: 'already_moderated', currentStatus: current };
  }

  const nowMs = input.nowMs ?? Date.now();
  const patch: Record<string, unknown> = {
    status: input.decision,
  };
  if (input.decision === 'approved') {
    // Match expiresAtOnApprove window (~7d) without importing email path.
    patch.expires_at = new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const { data: updated, error: upErr } = await supabase
    .from('offers')
    .update(patch)
    .eq('id', input.offerId)
    .eq('status', 'pending')
    .select('id, status')
    .maybeSingle();

  if (upErr) return { ok: false, reason: upErr.message };
  if (!updated) return { ok: false, reason: 'cas_lost', currentStatus: current };

  return {
    ok: true,
    previousStatus: 'pending',
    status: input.decision,
  };
}
