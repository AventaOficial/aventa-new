import { isPlatformAffiliateTagged } from '@/lib/affiliate';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';

export type BotInsertPublication = {
  status: 'pending' | 'approved';
  linkModOk: boolean;
  demoted: boolean;
};

/** ¿La URL ya está lista para el gate de afiliado existente? */
function affiliateUrlReady(offerUrl: string): boolean {
  const url = offerUrl.trim();
  if (!url) return false;
  if (!offerRequiresAffiliateValidation(url)) return false;
  return isPlatformAffiliateTagged(url);
}

/**
 * Fail-closed del publisher bot. No activa auto-publish.
 * - pending: puede marcar link_mod_ok si la URL ya está taggeada; nunca aprueba.
 * - approved pedido sin enlace afiliado listo → pending, sin link_mod_ok.
 */
export function resolveBotInsertPublication(opts: {
  requestedStatus: 'pending' | 'approved';
  offerUrl: string;
}): BotInsertPublication {
  const url = opts.offerUrl.trim();
  const linkReady = affiliateUrlReady(url);

  if (opts.requestedStatus !== 'approved') {
    return { status: 'pending', linkModOk: linkReady, demoted: false };
  }

  if (!url) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  if (offerRequiresAffiliateValidation(url) && !isPlatformAffiliateTagged(url)) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  return { status: 'approved', linkModOk: true, demoted: false };
}
