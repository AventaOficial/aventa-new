/**
 * Approve-time affiliate gate.
 * Delega la autoridad al contrato canónico `evaluateAffiliateReadiness`.
 */

export {
  offerRequiresAffiliateValidation,
  isCanonicalOfferUrlValid,
} from '@/lib/moderation/affiliateReadinessContract';

import {
  affiliateReadinessApproveError,
  evaluateAffiliateReadiness,
} from '@/lib/moderation/affiliateReadinessContract';

/**
 * Misma barra de afiliado para approve unitario y batch (P1-1).
 * Ready si: sin programa | URL tagged canónica | link_mod_ok + canónica.
 * ML bare-ID / no navegable sigue bloqueando aunque link_mod_ok=true.
 */
export function assertOfferReadyForAffiliateApproval(params: {
  offerUrl: string | null | undefined;
  linkModOk: boolean | null | undefined;
  /** @deprecated P1-1: ignorado — batch usa las mismas reglas que single. */
  batchApprove?: boolean;
  originalProductUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const result = evaluateAffiliateReadiness({
    offerUrl: params.offerUrl,
    originalOfferUrl: params.originalProductUrl,
    linkModOk: params.linkModOk,
  });
  if (result.ready) return { ok: true };
  return { ok: false, error: affiliateReadinessApproveError(result) };
}
