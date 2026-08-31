import { storeHasAffiliateProgram } from '@/lib/affiliate/assessOfferAffiliateLink';

/** ¿La oferta con URL requiere enlace afiliado validado antes de aprobar? */
export function offerRequiresAffiliateValidation(
  originalProductUrl: string | null | undefined
): boolean {
  const url = originalProductUrl?.trim() ?? '';
  if (!url) return false;
  return storeHasAffiliateProgram(url);
}

export function assertOfferReadyForAffiliateApproval(params: {
  offerUrl: string | null | undefined;
  linkModOk: boolean | null | undefined;
  batchApprove: boolean;
  originalProductUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const rawUrl = params.offerUrl?.trim() ?? '';
  if (!rawUrl || params.batchApprove) return { ok: true };

  const needsAffiliate = offerRequiresAffiliateValidation(
    params.originalProductUrl ?? params.offerUrl
  );
  if (!needsAffiliate) return { ok: true };

  if (params.linkModOk !== true) {
    return {
      ok: false,
      error: 'Valida y guarda el enlace afiliado antes de aprobar.',
    };
  }
  return { ok: true };
}
