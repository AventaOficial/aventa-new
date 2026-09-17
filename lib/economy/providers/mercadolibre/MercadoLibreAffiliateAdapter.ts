/**
 * Mercado Libre AffiliateNetworkAdapter.
 *
 * Economic ingest: NOT_SUPPORTED_BY_OFFICIAL_API → always fail-closed.
 * connected=false always (no live conversion/commission feed).
 * Does NOT call seller OAuth / seller order APIs.
 */

import type {
  AdapterParseResult,
  AffiliateNetworkAdapter,
  SignatureVerificationResult,
} from '../../adapter/types';
import {
  MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED,
  MERCADOLIBRE_ATTRIBUTION_WINDOW_HOURS,
} from './capabilityMatrix';
import { getMercadoLibreAffiliateConfig } from './config';
import { ML_AFFILIATE_ERROR_CODES } from './errors';
import { recordMercadoLibreAffiliateFailure } from './metrics';

const REFUSAL = ML_AFFILIATE_ERROR_CODES.NOT_SUPPORTED_BY_OFFICIAL_API;

export function createMercadoLibreAffiliateAdapter(): AffiliateNetworkAdapter {
  return {
    network: 'mercadolibre',
    providerId: 'mercadolibre_affiliates_mx',
    /** Economic connection requires official conversion/commission API — absent. */
    connected: false,
    async verifySignature(): Promise<SignatureVerificationResult> {
      recordMercadoLibreAffiliateFailure(REFUSAL);
      return {
        ok: false,
        reason:
          'Mercado Libre affiliate program has no official signed webhook for conversions/commissions',
        code: REFUSAL,
      };
    },
    parsePayload(): AdapterParseResult {
      recordMercadoLibreAffiliateFailure(REFUSAL);
      return {
        ok: false,
        error:
          'Refuse parse: affiliate conversion/commission reporting is NOT_SUPPORTED_BY_OFFICIAL_API',
        code: REFUSAL,
      };
    },
  };
}

export const MERCADOLIBRE_AFFILIATE_ADAPTER = createMercadoLibreAffiliateAdapter();

export function getMercadoLibreAffiliateRuntimeNote(): string {
  const cfg = getMercadoLibreAffiliateConfig();
  return [
    `enabled=${cfg.enabled}`,
    `mode=${cfg.mode}`,
    `linkTaggingConfigured=${cfg.linkTaggingConfigured}`,
    `economicIngestAllowed=${cfg.economicIngestAllowed}`,
    `attributionWindowHours=${MERCADOLIBRE_ATTRIBUTION_WINDOW_HOURS}`,
    `economicIngestSupported=${MERCADOLIBRE_AFFILIATE_ECONOMIC_INGEST_SUPPORTED}`,
    cfg.note,
  ].join(' · ');
}

/**
 * Explicit guard: never treat seller OAuth as affiliate economic authority.
 */
export function assertSellerOauthIsNotAffiliateAuthority(): {
  ok: true;
  code: typeof ML_AFFILIATE_ERROR_CODES.SELLER_OAUTH_NOT_AFFILIATE;
} {
  return {
    ok: true,
    code: ML_AFFILIATE_ERROR_CODES.SELLER_OAUTH_NOT_AFFILIATE,
  };
}
