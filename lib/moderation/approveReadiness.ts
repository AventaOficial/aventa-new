import { storeHasAffiliateProgram } from '@/lib/affiliate/assessOfferAffiliateLink';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreHost,
  isMercadoLibreNavigableProductUrl,
} from '@/lib/offers/resolveMercadoLibreItem';

/** ¿La oferta con URL requiere enlace afiliado validado antes de aprobar? */
export function offerRequiresAffiliateValidation(
  originalProductUrl: string | null | undefined
): boolean {
  const url = originalProductUrl?.trim() ?? '';
  if (!url) return false;
  return storeHasAffiliateProgram(url);
}

function isMlUrl(url: string): boolean {
  try {
    return isMercadoLibreHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Canonical source válida para ML (pathname navegable, no bare-ID).
 * Distinto de `link_mod_ok` (confirmación de paste afiliado).
 */
export function isCanonicalOfferUrlValid(url: string | null | undefined): boolean {
  const raw = url?.trim() ?? '';
  if (!raw) return false;
  if (!isMlUrl(raw)) return true; // no-ML: no aplicar contrato ML aquí
  if (isMercadoLibreBareItemPathUrl(raw)) return false;
  return isMercadoLibreNavigableProductUrl(raw);
}

/**
 * Misma barra de afiliado para approve unitario y batch (P1-1).
 * `batchApprove` ya no bypassa link_mod_ok.
 * ML: link_mod_ok no basta si offer_url es bare-ID / no navegable.
 */
export function assertOfferReadyForAffiliateApproval(params: {
  offerUrl: string | null | undefined;
  linkModOk: boolean | null | undefined;
  /** @deprecated P1-1: ignorado — batch usa las mismas reglas que single. */
  batchApprove?: boolean;
  originalProductUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  const rawUrl = params.offerUrl?.trim() ?? '';
  if (!rawUrl) return { ok: true };

  if (isMlUrl(rawUrl) && !isCanonicalOfferUrlValid(rawUrl)) {
    return {
      ok: false,
      error:
        'El enlace de Mercado Libre no es un permalink navegable. Usa la URL original del producto (/p/… o articulo…), no solo el ID.',
    };
  }

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
