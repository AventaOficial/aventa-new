/**
 * Mercado / país de operación de AVENTA.
 * Un país = misma fórmula de producto; cambian moneda, redes afiliadas, tax ID y payout.
 * Ver docs/PILARES_EXPANSION_50_PAISES.md
 */

export type MarketId = 'mx' | 'co' | 'ar' | 'cl' | 'pe' | 'es' | 'us' | 'br';

export type AffiliateNetworkId =
  | 'amazon'
  | 'mercadolibre'
  | 'aliexpress'
  | 'temu'
  | 'walmart'
  | 'shein'
  | 'other';

export type MarketConfig = {
  id: MarketId;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  nameEs: string;
  locale: string;
  currency: string;
  /** Default creator share in basis points (4000 = 40%) */
  defaultCreatorShareBps: number;
  minPayoutCents: number;
  payoutHoldDays: number;
  /** Redes afiliadas prioritarias en ese mercado */
  affiliateNetworks: AffiliateNetworkId[];
  /** Campo fiscal principal (RFC, NIT, CUIT, etc.) */
  taxIdLabel: string;
  /** Método de payout local */
  payoutMethod: 'spei' | 'local_transfer' | 'paypal' | 'wise' | 'other';
  /** Feature: programa de comisiones listo para ese mercado */
  commissionsEnabled: boolean;
};

/** Mercado activo de la app hoy (hasta multi-tenant por dominio/locale). */
export const ACTIVE_MARKET_ID: MarketId = 'mx';
