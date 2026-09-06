/**
 * Dominios de comercio / acortadores permitidos para fetch del parser (P1-7).
 * Lista explícita — no includes() parcial.
 */
import { isHostUnderAnyRegisteredDomain } from '@/lib/server/hostnameAllowlist';

/** TLDs Amazon usados por AVENTA (MX + comunes). */
export const AMAZON_REGISTERED_DOMAINS = [
  'amazon.com',
  'amazon.com.mx',
  'amazon.ca',
  'amazon.com.br',
  'amazon.co.uk',
  'amazon.de',
  'amazon.es',
  'amazon.fr',
  'amazon.it',
  'amazon.nl',
  'amazon.pl',
  'amazon.se',
  'amazon.com.au',
  'amazon.co.jp',
  'amazon.in',
  'amazon.sg',
  'amazon.ae',
  'amazon.sa',
  'amzn.to',
  'a.co',
] as const;

export const MERCADOLIBRE_REGISTERED_DOMAINS = [
  'mercadolibre.com',
  'mercadolibre.com.mx',
  'mercadolibre.com.ar',
  'mercadolibre.cl',
  'mercadolibre.com.co',
  'mercadolibre.com.pe',
  'mercadolibre.com.uy',
  'mercadolibre.com.ve',
  'mercadolibre.com.ec',
  'mercadolibre.com.bo',
  'mercadolibre.com.gt',
  'mercadolibre.com.hn',
  'mercadolibre.com.ni',
  'mercadolibre.com.sv',
  'mercadolibre.com.pa',
  'mercadolibre.com.cr',
  'mercadolibre.com.do',
  'mercadolibre.com.py',
  'mercadolivre.com',
  'mercadolivre.com.br',
  'mercadolivre.com.pt',
  'meli.la',
] as const;

export const ALIEXPRESS_REGISTERED_DOMAINS = [
  'aliexpress.com',
  'aliexpress.us',
  'aliexpress.ru',
] as const;

export const TEMU_REGISTERED_DOMAINS = ['temu.com'] as const;

export const WALMART_REGISTERED_DOMAINS = ['walmart.com', 'walmart.com.mx'] as const;

export const SHEIN_REGISTERED_DOMAINS = ['shein.com', 'shein.com.mx'] as const;

export function isOfferMercadoLibreHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, MERCADOLIBRE_REGISTERED_DOMAINS);
}

export function isOfferAmazonHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, AMAZON_REGISTERED_DOMAINS);
}

export function isOfferMeliLaHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, ['meli.la']);
}

export function isAllowedAffiliateNetworkHost(hostname: string): boolean {
  return (
    isHostUnderAnyRegisteredDomain(hostname, ALIEXPRESS_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, TEMU_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, WALMART_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, SHEIN_REGISTERED_DOMAINS)
  );
}
