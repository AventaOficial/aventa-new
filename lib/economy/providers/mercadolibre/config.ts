/**
 * Mercado Libre affiliate provider config — fail-closed defaults.
 * Seller OAuth env vars are intentionally NOT read here.
 */

export type MercadoLibreAffiliateMode = 'disabled' | 'observe' | 'ingest';

function envBool(name: string, fallback = false): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envMode(): MercadoLibreAffiliateMode {
  const raw = (process.env.AFFILIATE_MERCADOLIBRE_MODE ?? 'disabled').trim().toLowerCase();
  if (raw === 'observe' || raw === 'ingest') return raw;
  return 'disabled';
}

export type MercadoLibreAffiliateConfig = {
  /** Master switch — default false. */
  enabled: boolean;
  mode: MercadoLibreAffiliateMode;
  /** Link tagging credentials present (not economic ingest). */
  linkTaggingConfigured: boolean;
  /** Economic ingest never true until official API exists. */
  economicIngestAllowed: false;
  settlementEnabled: false;
  attributionWindowHours: 24;
  note: string;
};

export function getMercadoLibreAffiliateConfig(): MercadoLibreAffiliateConfig {
  const enabled = envBool('AFFILIATE_MERCADOLIBRE_ENABLED', false);
  const mode = envMode();
  const tag =
    process.env.ML_AFFILIATE_TAG?.trim() ||
    process.env.ML_MATT_WORD?.trim() ||
    '';
  const linkTaggingConfigured = Boolean(tag);

  return {
    enabled,
    mode: enabled ? mode : 'disabled',
    linkTaggingConfigured,
    economicIngestAllowed: false,
    settlementEnabled: false,
    attributionWindowHours: 24,
    note:
      'Mercado Libre affiliate economic ingest is NOT_SUPPORTED_BY_OFFICIAL_API. ' +
      'Seller OAuth must not be used as affiliate commission authority. ' +
      'Defaults: AFFILIATE_MERCADOLIBRE_ENABLED=false, MODE=disabled.',
  };
}
