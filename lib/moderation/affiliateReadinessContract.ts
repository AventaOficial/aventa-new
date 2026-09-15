/**
 * Contrato canónico de affiliate readiness (una sola autoridad).
 *
 * Responde: ¿esta oferta puede aprobarse desde el punto de vista de afiliado?
 *
 * Fuentes de readiness (en orden de evaluación):
 * 1. Sin URL operativa → no bloquea approve (histórico / sin enlace)
 * 2. URL ML no navegable / bare-ID → NOT READY
 * 3. Tienda sin programa afiliado configurado → READY
 * 4. URL operativa ya tagged (isPlatformAffiliateTagged) → READY
 * 5. link_mod_ok explícito del moderador + URL canónica → READY
 * 6. Else → NOT READY (falta tag / confirmación)
 *
 * NO duplica parsing de tags: reutiliza assessOfferAffiliateLink / isPlatformAffiliateTagged.
 * NO cambia Evidence / DQE / Price Intel / Qualification.
 */

import {
  assessOfferAffiliateLink,
  storeHasAffiliateProgram,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreHost,
  isMercadoLibreNavigableProductUrl,
} from '@/lib/offers/resolveMercadoLibreItem';

export type AffiliateReadinessReason =
  | 'ready_empty_url'
  | 'ready_no_program'
  | 'ready_platform_tagged'
  | 'ready_moderator_confirmed'
  | 'missing_url'
  | 'invalid_url'
  | 'non_navigable'
  | 'missing_affiliate_tag'
  | 'needs_moderator_confirmation';

export type AffiliateReadinessSource =
  | 'empty_url'
  | 'no_program'
  | 'platform_tagged'
  | 'moderator_confirmed'
  | 'not_ready';

export type AffiliateReadinessInput = {
  offerUrl?: string | null;
  /** Producto / baseline; si falta, se usa offerUrl. */
  originalOfferUrl?: string | null;
  linkModOk?: boolean | null;
};

export type AffiliateReadinessResult = {
  ready: boolean;
  reason: AffiliateReadinessReason;
  source: AffiliateReadinessSource;
  /** Etiqueta corta UI. */
  label: string;
  /** Frase humana. */
  detail: string;
  /** ¿La tienda tiene programa afiliado configurado? */
  programRequired: boolean;
  /** URL operativa evaluada (trimmed) o ''. */
  offerUrl: string;
};

function isMlUrl(url: string): boolean {
  try {
    return isMercadoLibreHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** ¿La oferta con URL requiere enlace afiliado validado antes de aprobar? */
export function offerRequiresAffiliateValidation(
  originalProductUrl: string | null | undefined
): boolean {
  const url = originalProductUrl?.trim() ?? '';
  if (!url) return false;
  return storeHasAffiliateProgram(url);
}

/**
 * Canonical source válida para ML (pathname navegable, no bare-ID).
 * Distinto de `link_mod_ok` (confirmación de paste afiliado).
 */
export function isCanonicalOfferUrlValid(url: string | null | undefined): boolean {
  const raw = url?.trim() ?? '';
  if (!raw) return false;
  if (!isMlUrl(raw)) return true;
  if (isMercadoLibreBareItemPathUrl(raw)) return false;
  return isMercadoLibreNavigableProductUrl(raw);
}

/**
 * Autoridad única de readiness afiliado (pura, sin I/O).
 */
export function evaluateAffiliateReadiness(
  input: AffiliateReadinessInput
): AffiliateReadinessResult {
  const offerUrl = (input.offerUrl ?? '').trim();
  const original = (input.originalOfferUrl ?? '').trim();
  const linkModOk = input.linkModOk === true;

  // Approve histórico: sin URL operativa no bloquea.
  if (!offerUrl) {
    if (!original) {
      return {
        ready: true,
        reason: 'ready_empty_url',
        source: 'empty_url',
        label: 'No disponible',
        detail: 'No hay información suficiente.',
        programRequired: false,
        offerUrl: '',
      };
    }
    const programRequired = storeHasAffiliateProgram(original);
    if (isMlUrl(original) && !isCanonicalOfferUrlValid(original)) {
      return {
        ready: false,
        reason: 'non_navigable',
        source: 'not_ready',
        label: 'Requiere atención',
        detail:
          'El enlace de Mercado Libre no es un permalink navegable. Abre / prepara la URL original del producto.',
        programRequired,
        offerUrl: '',
      };
    }
    if (!programRequired) {
      return {
        ready: true,
        reason: 'ready_no_program',
        source: 'no_program',
        label: 'Sin programa',
        detail: 'Esta tienda no tiene programa afiliado configurado.',
        programRequired: false,
        offerUrl: '',
      };
    }
    return {
      ready: false,
      reason: 'missing_url',
      source: 'not_ready',
      label: 'Requiere atención',
      detail: 'Falta el enlace operativo de la oferta.',
      programRequired: true,
      offerUrl: '',
    };
  }

  const programProbe = original || offerUrl;
  const programRequired = offerRequiresAffiliateValidation(programProbe);

  // Canonical / navigability on operative URL (ML).
  if (isMlUrl(offerUrl)) {
    if (isMercadoLibreBareItemPathUrl(offerUrl) || !isCanonicalOfferUrlValid(offerUrl)) {
      return {
        ready: false,
        reason: 'non_navigable',
        source: 'not_ready',
        label: 'Requiere atención',
        detail:
          'El enlace de Mercado Libre no es un permalink navegable. Usa la URL original del producto (/p/… o articulo…), no solo el ID.',
        programRequired,
        offerUrl,
      };
    }
  } else {
    try {
      new URL(offerUrl);
    } catch {
      return {
        ready: false,
        reason: 'invalid_url',
        source: 'not_ready',
        label: 'Requiere atención',
        detail: 'El enlace de la oferta no es una URL válida.',
        programRequired,
        offerUrl,
      };
    }
  }

  if (!programRequired) {
    return {
      ready: true,
      reason: 'ready_no_program',
      source: 'no_program',
      label: 'Sin programa',
      detail: 'Esta tienda no tiene programa afiliado configurado.',
      programRequired: false,
      offerUrl,
    };
  }

  const assessment = assessOfferAffiliateLink(offerUrl);
  if (assessment.isTagged) {
    return {
      ready: true,
      reason: 'ready_platform_tagged',
      source: 'platform_tagged',
      label: 'Lista',
      detail: 'Aventa puede monetizar este enlace.',
      programRequired: true,
      offerUrl,
    };
  }

  if (linkModOk) {
    return {
      ready: true,
      reason: 'ready_moderator_confirmed',
      source: 'moderator_confirmed',
      label: 'Lista',
      detail: 'Aventa puede monetizar este enlace.',
      programRequired: true,
      offerUrl,
    };
  }

  return {
    ready: false,
    reason: 'missing_affiliate_tag',
    source: 'not_ready',
    label: 'Requiere atención',
    detail: 'No se pudo preparar el enlace monetizado.',
    programRequired: true,
    offerUrl,
  };
}

/** ¿Debemos persistir link_mod_ok=true tras un write de offer_url? */
export function shouldPersistLinkModOk(input: AffiliateReadinessInput): boolean {
  // Evaluar la URL sola (sin confiar en flag previo): solo tagged+canónica.
  const fromUrlAlone = evaluateAffiliateReadiness({
    offerUrl: input.offerUrl,
    originalOfferUrl: input.originalOfferUrl,
    linkModOk: false,
  });
  return fromUrlAlone.ready && fromUrlAlone.source === 'platform_tagged';
}

/** Mensaje de error de approve alineado al contrato. */
export function affiliateReadinessApproveError(result: AffiliateReadinessResult): string {
  switch (result.reason) {
    case 'non_navigable':
      return 'El enlace de Mercado Libre no es un permalink navegable. Usa la URL original del producto (/p/… o articulo…), no solo el ID.';
    case 'invalid_url':
      return 'El enlace de la oferta no es una URL válida.';
    case 'missing_url':
    case 'missing_affiliate_tag':
    case 'needs_moderator_confirmation':
      return 'Valida y guarda el enlace afiliado antes de aprobar.';
    default:
      return 'Valida y guarda el enlace afiliado antes de aprobar.';
  }
}
