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
  /** Amazon mobile / Branch deep-link hop used by a.co shares */
  'amazon.app.link',
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

export const TEMU_REGISTERED_DOMAINS = ['temu.com', 'temu.to'] as const;

export const WALMART_REGISTERED_DOMAINS = [
  'walmart.com',
  'walmart.com.mx',
  /** Firebase Dynamic Links de la app Walmart MX */
  'walmart.page.link',
] as const;

export const SHEIN_REGISTERED_DOMAINS = ['shein.com', 'shein.com.mx'] as const;

/** eBay (presencia MX / shortlinks). */
export const EBAY_REGISTERED_DOMAINS = [
  'ebay.com',
  'ebay.com.mx',
  'ebay.mx',
  'ebay.to',
  'ebay.us',
] as const;

/**
 * Retail / marketplaces cotizados en México para autorellenado de ofertas.
 * Solo hosts verificables (DNS). Sin Best Buy MX / Linio MX (cerrados).
 * No incluye bit.ly/goo.gl genéricos (SSRF / redirect abiertos).
 */
export const MX_COMMERCE_REGISTERED_DOMAINS = [
  // Department / retail
  'liverpool.com.mx',
  'liverpool.app.link',
  'coppel.com',
  'coppel.com.mx',
  'coppel.app.link',
  'elpalaciodehierro.com',
  'sears.com.mx',
  'suburbia.com.mx',
  'elektra.com.mx',
  'elektra.mx',
  'sanborns.com.mx',
  'claroshop.com',
  'claroshop.com.mx',

  // Club / wholesale / office
  'costco.com.mx',
  'cost.co',
  'sams.com.mx',
  'officedepot.com.mx',
  'officemax.com.mx',
  'cityclub.com.mx',

  // Supermercados / día a día
  'bodegaaurrera.com.mx',
  'chedraui.com.mx',
  'soriana.com',
  'heb.com.mx',
  'lacomer.com.mx',
  'citymarket.com.mx',
  'fresko.com.mx',
  /** Legacy Walmart Express */
  'superama.com.mx',
  'superama.com',

  // Especialistas / DIY / tech
  'homedepot.com.mx',
  'sodimac.com.mx',
  'cyberpuerta.mx',
  'cyberpuerta.com',
  'cyberpuerta.com.mx',
  'ddtech.mx',
  'pcel.com',
  'doto.com.mx',
  'steren.com.mx',
  'radioshack.com.mx',

  // Moda / deporte / Apple
  'nike.com',
  'adidas.mx',
  'adidas.com',
  'apple.com',
  'apple.com.mx',
  'ishopmixup.com',
  'mixup.com.mx',
  'innovasport.com',
  'priceshoes.com',
  'andrea.com.mx',

  // Marketplaces adicionales con tráfico MX
  'shopee.com.mx',
  'shopee.mx',
  'shp.ee',
] as const;

export function isOfferMercadoLibreHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, MERCADOLIBRE_REGISTERED_DOMAINS);
}

export function isOfferAmazonHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, AMAZON_REGISTERED_DOMAINS);
}

export function isOfferMeliLaHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, ['meli.la']);
}

export function isOfferEbayHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, EBAY_REGISTERED_DOMAINS);
}

/** Redes afiliadas globales ya soportadas (histórico). */
export function isAllowedAffiliateNetworkHost(hostname: string): boolean {
  return (
    isHostUnderAnyRegisteredDomain(hostname, ALIEXPRESS_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, TEMU_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, WALMART_REGISTERED_DOMAINS) ||
    isHostUnderAnyRegisteredDomain(hostname, SHEIN_REGISTERED_DOMAINS) ||
    isOfferEbayHost(hostname)
  );
}

/** Retail MX para parse-offer-url (no implica machine ingest afiliado). */
export function isAllowedMxCommerceHost(hostname: string): boolean {
  return isHostUnderAnyRegisteredDomain(hostname, MX_COMMERCE_REGISTERED_DOMAINS);
}
