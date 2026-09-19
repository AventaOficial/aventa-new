/**
 * CazaOfertasss — FASE 0. Affiliate mapping y elegibilidad.
 *
 * Autoridad: esta capa decide si una oferta es MONETIZABLE. No decide si la
 * oferta es buena (scoring) ni si es real (evidence).
 *
 * Regla dura: una URL normal NUNCA se asume afiliada. La afiliación existe sólo
 * si hay un `AffiliateAttachment` explícito cuyo URL lleva los marcadores de la
 * red correspondiente.
 */

import { TRACKING_LABEL_PATTERN } from './constants';
import { normalizeProductUrl, stableHash } from './identity';
import type {
  AffiliateAttachment,
  AffiliateEligibility,
  AffiliateNetworkId,
  CazaResult,
  CazaStoreId,
  DealIdentity,
  IsoTimestamp,
} from './types';
import { failResult, okResult } from './types';

export interface AffiliateNetworkConfig {
  readonly network: AffiliateNetworkId;
  readonly store: CazaStoreId;
  /**
   * Query params que deben estar presentes para considerar el URL afiliado.
   * `requireAll: false` ⇒ basta uno.
   */
  readonly markerQueryParams: readonly string[];
  readonly requireAllMarkers: boolean;
  /** Nombre de la env var con la credencial. Nunca el valor. */
  readonly credentialEnvVar: string;
  /**
   * `false` ⇒ no existe integración oficial confirmada para generar links
   * programáticamente; sólo mapping manual/operado.
   */
  readonly programmaticLinkGenerationAvailable: boolean;
}

/**
 * Registro de redes. Los parámetros marcadores son los documentados
 * públicamente por cada programa; si una red cambia su esquema, se actualiza
 * aquí y los tests de elegibilidad lo detectan.
 */
export const AFFILIATE_NETWORKS: Readonly<Record<AffiliateNetworkId, AffiliateNetworkConfig>> = {
  mercadolibre_affiliates: {
    network: 'mercadolibre_affiliates',
    store: 'mercadolibre_mx',
    markerQueryParams: ['matt_word', 'matt_tool'],
    requireAllMarkers: false,
    credentialEnvVar: 'CAZAOFERTAS_ML_AFFILIATE_TAG',
    programmaticLinkGenerationAvailable: false,
  },
  amazon_associates_mx: {
    network: 'amazon_associates_mx',
    store: 'amazon_mx',
    markerQueryParams: ['tag'],
    requireAllMarkers: true,
    credentialEnvVar: 'CAZAOFERTAS_AMAZON_ASSOCIATE_TAG',
    programmaticLinkGenerationAvailable: false,
  },
};

const STORE_TO_NETWORK: Readonly<Record<CazaStoreId, AffiliateNetworkId>> = {
  mercadolibre_mx: 'mercadolibre_affiliates',
  amazon_mx: 'amazon_associates_mx',
};

export function networkForStore(store: CazaStoreId): AffiliateNetworkId {
  return STORE_TO_NETWORK[store];
}

export function isValidTrackingLabel(value: unknown): value is string {
  return typeof value === 'string' && TRACKING_LABEL_PATTERN.test(value);
}

/**
 * Etiqueta de tracking determinista y estable por (deal, red, día de
 * generación). No contiene secretos ni datos de usuario.
 */
export function buildTrackingLabel(
  dealId: string,
  network: AffiliateNetworkId,
  generatedAt: IsoTimestamp
): CazaResult<string> {
  const ms = Date.parse(generatedAt);
  if (!Number.isFinite(ms)) return failResult(['tracking_label.timestamp_invalid']);
  const day = new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
  const label = `caza_${stableHash(`${dealId}|${network}`)}_${day}`;
  if (!isValidTrackingLabel(label)) return failResult(['tracking_label.pattern_invalid']);
  return okResult(label);
}

/**
 * ¿El URL lleva los marcadores de la red? Verificación estructural, no una
 * promesa de que la credencial sea correcta.
 */
export function affiliateUrlCarriesNetworkMarkers(
  network: AffiliateNetworkId,
  affiliateUrl: string
): boolean {
  const config = AFFILIATE_NETWORKS[network];
  let parsed: URL;
  try {
    parsed = new URL(affiliateUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const present = config.markerQueryParams.filter((param) => {
    const value = parsed.searchParams.get(param);
    return typeof value === 'string' && value.trim().length > 0;
  });

  return config.requireAllMarkers
    ? present.length === config.markerQueryParams.length
    : present.length > 0;
}

export function validateAffiliateAttachment(
  attachment: unknown
): CazaResult<AffiliateAttachment> {
  if (attachment === null || typeof attachment !== 'object') {
    return failResult(['affiliate.attachment_missing']);
  }
  const raw = attachment as Partial<AffiliateAttachment>;

  const network = raw.affiliateNetwork;
  if (typeof network !== 'string' || !(network in AFFILIATE_NETWORKS)) {
    return failResult([`affiliate.network_unknown:${String(network)}`]);
  }
  const config = AFFILIATE_NETWORKS[network as AffiliateNetworkId];

  if (typeof raw.affiliateUrl !== 'string' || raw.affiliateUrl.trim().length === 0) {
    return failResult(['affiliate.url_missing']);
  }
  if (!affiliateUrlCarriesNetworkMarkers(config.network, raw.affiliateUrl)) {
    return failResult([`affiliate.url_missing_network_markers:${config.network}`]);
  }
  if (!isValidTrackingLabel(raw.affiliateTrackingLabel)) {
    return failResult(['affiliate.tracking_label_invalid']);
  }
  if (typeof raw.affiliateGeneratedAt !== 'string' || !Number.isFinite(Date.parse(raw.affiliateGeneratedAt))) {
    return failResult(['affiliate.generated_at_invalid']);
  }
  if (typeof raw.affiliateCredentialRef !== 'string' || !/^[A-Z][A-Z0-9_]{3,64}$/.test(raw.affiliateCredentialRef)) {
    return failResult(['affiliate.credential_ref_invalid']);
  }
  // Defensa: el contrato referencia env vars, no valores. Un ref que "parece"
  // un secreto (contiene '=' o es demasiado largo) se rechaza.
  if (raw.affiliateCredentialRef !== config.credentialEnvVar) {
    return failResult([`affiliate.credential_ref_unexpected:${raw.affiliateCredentialRef}`]);
  }

  return okResult({
    affiliateNetwork: config.network,
    affiliateUrl: raw.affiliateUrl.trim(),
    affiliateTrackingLabel: raw.affiliateTrackingLabel,
    affiliateGeneratedAt: raw.affiliateGeneratedAt,
    affiliateCredentialRef: raw.affiliateCredentialRef,
  });
}

export interface AffiliateEligibilityInput {
  readonly identity: DealIdentity;
  readonly canonicalUrl: string;
  readonly attachment: AffiliateAttachment | null;
}

/**
 * Elegibilidad de monetización.
 *
 * `monetizable: false` ⇒ el candidato queda FUERA de publicación monetizada,
 * aunque su score sea excelente.
 */
export function assessAffiliateEligibility(
  input: AffiliateEligibilityInput
): AffiliateEligibility {
  const reasons: string[] = [];

  if (input.attachment === null) {
    return {
      eligible: false,
      monetizable: false,
      reasons: ['affiliate.no_attachment'],
    };
  }

  const validated = validateAffiliateAttachment(input.attachment);
  if (!validated.ok) {
    return { eligible: false, monetizable: false, reasons: validated.reasons };
  }
  const attachment = validated.value;

  const expectedNetwork = networkForStore(input.identity.store);
  if (attachment.affiliateNetwork !== expectedNetwork) {
    reasons.push(
      `affiliate.network_store_mismatch:${attachment.affiliateNetwork}!=${expectedNetwork}`
    );
  }

  const canonical = normalizeProductUrl(input.canonicalUrl);
  if (!canonical.ok) {
    reasons.push(...canonical.reasons.map((r) => `affiliate.canonical_${r}`));
  } else {
    const affiliateNormalized = normalizeProductUrl(attachment.affiliateUrl);
    if (!affiliateNormalized.ok) {
      reasons.push(...affiliateNormalized.reasons.map((r) => `affiliate.url_${r}`));
    } else if (affiliateNormalized.value.host !== canonical.value.host) {
      // FASE 0 no soporta redirectores: el link afiliado debe apuntar al mismo host.
      reasons.push(
        `affiliate.host_mismatch:${affiliateNormalized.value.host}!=${canonical.value.host}`
      );
    }
    // El URL afiliado no puede ser idéntico al canónico: si lo fuera, no lleva
    // marcadores y no habría atribución.
    if (attachment.affiliateUrl.trim() === canonical.value.url) {
      reasons.push('affiliate.url_equals_canonical');
    }
  }

  const eligible = reasons.length === 0;
  return {
    eligible,
    monetizable: eligible,
    reasons: eligible ? ['affiliate.eligible'] : reasons,
  };
}
