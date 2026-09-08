import { isPlatformAffiliateTagged } from '@/lib/affiliate';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';

export type BotInsertPublication = {
  status: 'pending' | 'approved';
  linkModOk: boolean;
  demoted: boolean;
};

/**
 * Fail-closed del publisher bot. No activa auto-publish.
 * Si alguien pide approved sin enlace afiliado listo → pending, sin link_mod_ok.
 */
export function resolveBotInsertPublication(opts: {
  requestedStatus: 'pending' | 'approved';
  offerUrl: string;
}): BotInsertPublication {
  if (opts.requestedStatus !== 'approved') {
    return { status: 'pending', linkModOk: false, demoted: false };
  }

  const url = opts.offerUrl.trim();
  if (!url) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  if (offerRequiresAffiliateValidation(url) && !isPlatformAffiliateTagged(url)) {
    return { status: 'pending', linkModOk: false, demoted: true };
  }

  return { status: 'approved', linkModOk: true, demoted: false };
}
