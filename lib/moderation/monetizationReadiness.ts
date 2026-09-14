import {
  assessOfferAffiliateLink,
  storeHasAffiliateProgram,
} from '@/lib/affiliate/assessOfferAffiliateLink';
import {
  isMercadoLibreBareItemPathUrl,
  isMercadoLibreHost,
  isMercadoLibreNavigableProductUrl,
} from '@/lib/offers/resolveMercadoLibreItem';

export type MonetizationReadinessStatus =
  | 'ready'
  | 'needs_attention'
  | 'no_program'
  | 'unknown';

export type MonetizationReadinessResult = {
  status: MonetizationReadinessStatus;
  /** Etiqueta corta para UI. */
  label: string;
  /** Frase humana de apoyo. */
  detail: string;
};

export type MonetizationReadinessInput = {
  offerUrl?: string | null;
  originalOfferUrl?: string | null;
  linkModOk?: boolean | null;
};

const counters = {
  ready: 0,
  needs_attention: 0,
  no_program: 0,
  unknown: 0,
};

export function getMonetizationReadinessMetrics() {
  return {
    monetizationReady: counters.ready,
    monetizationNeedsAttention: counters.needs_attention,
    monetizationNoProgram: counters.no_program,
    monetizationUnknown: counters.unknown,
  };
}

export function resetMonetizationReadinessMetrics() {
  counters.ready = 0;
  counters.needs_attention = 0;
  counters.no_program = 0;
  counters.unknown = 0;
}

function bump(status: MonetizationReadinessStatus) {
  counters[status] += 1;
}

function isMl(url: string): boolean {
  try {
    return isMercadoLibreHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Evaluación pura (sin métricas). Misma regla que computeMonetizationReadiness.
 * El Decision Engine la usa en shadow para no contaminar contadores de Focus.
 *
 * Contratos:
 * - canonical_url_valid: permalink ML navegable (no bare-ID)
 * - affiliate_url_ready / link_mod_ok: tags / confirmación de paste
 * link_mod_ok solo NO implica ready si la canonical está rota.
 */
export function evaluateMonetizationReadiness(
  input: MonetizationReadinessInput
): MonetizationReadinessResult {
  const offerUrl = (input.offerUrl ?? '').trim();
  const original = (input.originalOfferUrl ?? '').trim();
  const probe = offerUrl || original;

  if (!probe) {
    return {
      status: 'unknown',
      label: 'No disponible',
      detail: 'No hay información suficiente.',
    };
  }

  const hasProgram = storeHasAffiliateProgram(probe);
  if (!hasProgram) {
    return {
      status: 'no_program',
      label: 'Sin programa',
      detail: 'Esta tienda no tiene programa afiliado configurado.',
    };
  }

  if (isMl(probe)) {
    const navigableOffer = offerUrl ? isMercadoLibreNavigableProductUrl(offerUrl) : false;
    const navigableOriginal = original ? isMercadoLibreNavigableProductUrl(original) : false;
    const bare =
      (offerUrl && isMercadoLibreBareItemPathUrl(offerUrl)) ||
      (!offerUrl && original && isMercadoLibreBareItemPathUrl(original));
    if (bare || (!navigableOffer && !navigableOriginal)) {
      return {
        status: 'needs_attention',
        label: 'Requiere atención',
        detail:
          'El enlace de Mercado Libre no es un permalink navegable. Abre / prepara la URL original del producto.',
      };
    }
  }

  const assessment = assessOfferAffiliateLink(offerUrl || probe);
  const prepared = input.linkModOk === true || assessment.isTagged;

  if (prepared) {
    return {
      status: 'ready',
      label: 'Lista',
      detail: 'Aventa puede monetizar este enlace.',
    };
  }

  return {
    status: 'needs_attention',
    label: 'Requiere atención',
    detail: 'No se pudo preparar el enlace monetizado.',
  };
}

/**
 * Estado humano de preparación de monetización.
 */
export function computeMonetizationReadiness(
  input: MonetizationReadinessInput
): MonetizationReadinessResult {
  const result = evaluateMonetizationReadiness(input);
  bump(result.status);
  return result;
}

/** Mensaje humano para errores de approve relacionados con afiliado. */
export function humanizeAffiliateApproveError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  if (
    msg.includes('afiliad') ||
    msg.includes('link_mod') ||
    msg.includes('valida y guarda') ||
    msg.includes('tag de aventa') ||
    msg.includes('permalink') ||
    msg.includes('navegable') ||
    msg.includes('enlace')
  ) {
    return 'Falta preparar el enlace para Aventa.';
  }
  return raw?.trim() || 'No se pudo aprobar la oferta.';
}
