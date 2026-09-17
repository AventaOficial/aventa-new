/**
 * Provider-local errors — never leak secrets.
 */

export class MercadoLibreAffiliateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MercadoLibreAffiliateError';
    this.code = code;
  }
}

export const ML_AFFILIATE_ERROR_CODES = {
  NOT_SUPPORTED_BY_OFFICIAL_API: 'NOT_SUPPORTED_BY_OFFICIAL_API',
  PROVIDER_DISABLED: 'provider_disabled',
  ECONOMIC_INGEST_FORBIDDEN: 'economic_ingest_forbidden',
  MISSING_EXTERNAL_ID: 'missing_external_id',
  FORGED_AMOUNT_REFUSED: 'forged_amount_refused',
  SELLER_OAUTH_NOT_AFFILIATE: 'seller_oauth_not_affiliate_authority',
} as const;
