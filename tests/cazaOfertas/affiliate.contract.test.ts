/**
 * CazaOfertasss — FASE 0. Contratos de afiliación: mapping, marcadores,
 * elegibilidad y separación canonicalUrl / affiliateUrl.
 */

import { describe, expect, it } from 'vitest';

import {
  AFFILIATE_NETWORKS,
  affiliateUrlCarriesNetworkMarkers,
  assessAffiliateEligibility,
  buildDealCandidate,
  buildDealIdentity,
  buildTrackingLabel,
  isValidTrackingLabel,
  networkForStore,
  validateAffiliateAttachment,
} from '@/lib/cazaOfertas';

import {
  AMAZON_CANONICAL_URL,
  AMAZON_RAW_URL,
  ML_CANONICAL_URL,
  NOW,
  NOW_ISO,
  amazonAffiliate,
  amazonDraft,
  mercadoLibreAffiliate,
  mercadoLibreDraft,
} from './fixtures';

function amazonIdentity() {
  const r = buildDealIdentity({ store: 'amazon_mx', url: AMAZON_RAW_URL });
  if (!r.ok) throw new Error(r.reasons.join(', '));
  return r.value;
}

describe('registro de redes', () => {
  it('cada tienda mapea a exactamente una red', () => {
    expect(networkForStore('amazon_mx')).toBe('amazon_associates_mx');
    expect(networkForStore('mercadolibre_mx')).toBe('mercadolibre_affiliates');
  });

  it('ninguna red declara generación programática de links en FASE 0', () => {
    for (const config of Object.values(AFFILIATE_NETWORKS)) {
      expect(config.programmaticLinkGenerationAvailable).toBe(false);
    }
  });

  it('las credenciales se referencian por nombre de env var, nunca por valor', () => {
    for (const config of Object.values(AFFILIATE_NETWORKS)) {
      expect(config.credentialEnvVar).toMatch(/^[A-Z][A-Z0-9_]{3,64}$/);
      expect(process.env[config.credentialEnvVar] ?? '').not.toBe(config.credentialEnvVar);
    }
  });
});

describe('tracking label', () => {
  it('es determinista por deal + red + día', () => {
    const a = buildTrackingLabel('caza_amazon_mx_abcd1234', 'amazon_associates_mx', NOW_ISO);
    const b = buildTrackingLabel('caza_amazon_mx_abcd1234', 'amazon_associates_mx', NOW_ISO);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(isValidTrackingLabel(a.value)).toBe(true);
  });

  it('cambia con el deal y con la red', () => {
    const base = buildTrackingLabel('caza_a', 'amazon_associates_mx', NOW_ISO);
    const otherDeal = buildTrackingLabel('caza_b', 'amazon_associates_mx', NOW_ISO);
    const otherNetwork = buildTrackingLabel('caza_a', 'mercadolibre_affiliates', NOW_ISO);
    expect(base).not.toEqual(otherDeal);
    expect(base).not.toEqual(otherNetwork);
  });

  it('rechaza timestamps inválidos', () => {
    expect(buildTrackingLabel('caza_a', 'amazon_associates_mx', 'mañana').ok).toBe(false);
  });

  it('rechaza etiquetas con formato inválido', () => {
    for (const label of ['', 'abc', 'CAZA_MAYUSCULAS', 'caza con espacios', 'caza-guion', 'x'.repeat(65)]) {
      expect(isValidTrackingLabel(label), `esperaba rechazar "${label}"`).toBe(false);
    }
  });
});

describe('marcadores de red', () => {
  it('Amazon exige el parámetro tag', () => {
    expect(
      affiliateUrlCarriesNetworkMarkers(
        'amazon_associates_mx',
        'https://amazon.com.mx/dp/B08N5WRWNW?tag=cazaofertasss-20'
      )
    ).toBe(true);
    expect(affiliateUrlCarriesNetworkMarkers('amazon_associates_mx', AMAZON_CANONICAL_URL)).toBe(
      false
    );
    expect(
      affiliateUrlCarriesNetworkMarkers(
        'amazon_associates_mx',
        'https://amazon.com.mx/dp/B08N5WRWNW?tag='
      )
    ).toBe(false);
  });

  it('Mercado Libre acepta cualquiera de sus marcadores', () => {
    expect(
      affiliateUrlCarriesNetworkMarkers(
        'mercadolibre_affiliates',
        `${ML_CANONICAL_URL}?matt_tool=12345`
      )
    ).toBe(true);
    expect(affiliateUrlCarriesNetworkMarkers('mercadolibre_affiliates', ML_CANONICAL_URL)).toBe(
      false
    );
  });

  it('una URL normal NUNCA se considera afiliada', () => {
    expect(affiliateUrlCarriesNetworkMarkers('amazon_associates_mx', AMAZON_CANONICAL_URL)).toBe(
      false
    );
    expect(affiliateUrlCarriesNetworkMarkers('amazon_associates_mx', 'no-es-url')).toBe(false);
    expect(
      affiliateUrlCarriesNetworkMarkers('amazon_associates_mx', 'http://amazon.com.mx/dp/B08N5WRWNW?tag=x')
    ).toBe(false);
  });
});

describe('validateAffiliateAttachment', () => {
  it('acepta un attachment bien formado', () => {
    const r = validateAffiliateAttachment(amazonAffiliate());
    expect(r.ok).toBe(true);
  });

  it('rechaza attachment ausente o no objeto', () => {
    for (const raw of [null, undefined, 'https://amazon.com.mx/dp/B08N5WRWNW', 42]) {
      expect(validateAffiliateAttachment(raw).ok).toBe(false);
    }
  });

  it('rechaza red desconocida', () => {
    const r = validateAffiliateAttachment(
      amazonAffiliate({ affiliateNetwork: 'red_inventada' as never })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('affiliate.network_unknown');
  });

  it('rechaza URL sin marcadores de la red', () => {
    const r = validateAffiliateAttachment(
      amazonAffiliate({ affiliateUrl: AMAZON_CANONICAL_URL })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('affiliate.url_missing_network_markers');
  });

  it('rechaza una referencia de credencial que no sea la env var esperada', () => {
    const r = validateAffiliateAttachment(
      amazonAffiliate({ affiliateCredentialRef: 'OTRA_ENV_VAR' })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('affiliate.credential_ref_unexpected');
  });

  it('rechaza algo que parezca un secreto en lugar de un nombre de env var', () => {
    const r = validateAffiliateAttachment(
      amazonAffiliate({ affiliateCredentialRef: 'cazaofertasss-20' })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('affiliate.credential_ref_invalid');
  });

  it('rechaza tracking label inválido', () => {
    const r = validateAffiliateAttachment(
      amazonAffiliate({ affiliateTrackingLabel: 'NO VALIDA' })
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons).toContain('affiliate.tracking_label_invalid');
  });
});

describe('assessAffiliateEligibility', () => {
  it('sin attachment no es monetizable', () => {
    const e = assessAffiliateEligibility({
      identity: amazonIdentity(),
      canonicalUrl: AMAZON_CANONICAL_URL,
      attachment: null,
    });
    expect(e.eligible).toBe(false);
    expect(e.monetizable).toBe(false);
    expect(e.reasons).toContain('affiliate.no_attachment');
  });

  it('attachment válido del mismo host es monetizable', () => {
    const e = assessAffiliateEligibility({
      identity: amazonIdentity(),
      canonicalUrl: AMAZON_CANONICAL_URL,
      attachment: amazonAffiliate(),
    });
    expect(e.eligible).toBe(true);
    expect(e.monetizable).toBe(true);
  });

  it('rechaza red que no corresponde a la tienda', () => {
    const e = assessAffiliateEligibility({
      identity: amazonIdentity(),
      canonicalUrl: AMAZON_CANONICAL_URL,
      attachment: mercadoLibreAffiliate(),
    });
    expect(e.monetizable).toBe(false);
    expect(e.reasons.some((r) => r.startsWith('affiliate.network_store_mismatch'))).toBe(true);
  });

  it('rechaza cuando el URL afiliado apunta a otro host', () => {
    const e = assessAffiliateEligibility({
      identity: amazonIdentity(),
      canonicalUrl: AMAZON_CANONICAL_URL,
      attachment: amazonAffiliate({
        affiliateUrl: 'https://amzn.example.com/dp/B08N5WRWNW?tag=cazaofertasss-20',
      }),
    });
    expect(e.monetizable).toBe(false);
    expect(e.reasons.some((r) => r.startsWith('affiliate.host_mismatch'))).toBe(true);
  });
});

describe('separación canonicalUrl / affiliateUrl en el candidato', () => {
  it('el candidato monetizable conserva ambas URLs distintas', () => {
    const r = buildDealCandidate(amazonDraft(), { now: NOW, affiliate: amazonAffiliate() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.canonicalUrl).toBe(AMAZON_CANONICAL_URL);
    expect(r.value.affiliateUrl).not.toBe(r.value.canonicalUrl);
    expect(r.value.affiliate?.affiliateNetwork).toBe('amazon_associates_mx');
    expect(r.value.affiliate?.affiliateGeneratedAt).toBe(NOW_ISO);
    expect(r.value.status).toBe('PUBLICATION_READY');
  });

  it('sin afiliación elegible el candidato queda VALIDATED, no publicable', () => {
    const r = buildDealCandidate(mercadoLibreDraft(), { now: NOW, affiliate: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.affiliateUrl).toBeNull();
    expect(r.value.affiliate).toBeNull();
    expect(r.value.status).toBe('VALIDATED');
    expect(r.value.score.grade).toBe('GREAT_DEAL');
  });

  it('un affiliate inválido no contamina el candidato', () => {
    const r = buildDealCandidate(amazonDraft(), {
      now: NOW,
      affiliate: amazonAffiliate({ affiliateUrl: AMAZON_CANONICAL_URL }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.affiliate).toBeNull();
    expect(r.value.affiliateUrl).toBeNull();
    expect(r.value.status).toBe('VALIDATED');
  });
});
