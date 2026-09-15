import { evaluateAffiliateReadiness } from '@/lib/moderation/affiliateReadinessContract';
import { isPlatformAffiliateTagged } from '@/lib/affiliate';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/affiliateReadinessContract';

export type BotInsertPublication = {
  status: 'pending' | 'approved';
  linkModOk: boolean;
  demoted: boolean;
};

/**
 * Fail-closed del publisher bot. No activa auto-publish.
 * link_mod_ok sigue el contrato canónico (tagged | no_program).
 * - pending: puede marcar link_mod_ok si la URL ya está lista; nunca aprueba.
 * - approved pedido sin enlace afiliado listo → pending, sin link_mod_ok.
 */
export function resolveBotInsertPublication(opts: {
  requestedStatus: 'pending' | 'approved';
  offerUrl: string;
}): BotInsertPublication {
  const url = opts.offerUrl.trim();
  const readiness = evaluateAffiliateReadiness({
    offerUrl: url,
    originalOfferUrl: url,
    linkModOk: false,
  });
  const linkModOk =
    readiness.ready &&
    (readiness.source === 'platform_tagged' || readiness.source === 'no_program');

  if (opts.requestedStatus !== 'approved') {
    return { status: 'pending', linkModOk, demoted: false };
  }

  if (!url) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  // Aprobado solo si el contrato dice ready (tagged o sin programa).
  if (!readiness.ready) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  // Defensa extra: si hay programa, debe estar tagged (no solo link_mod_ok inventado).
  if (offerRequiresAffiliateValidation(url) && !isPlatformAffiliateTagged(url)) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  return { status: 'approved', linkModOk: true, demoted: false };
}
