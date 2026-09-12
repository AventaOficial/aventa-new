import { DAY_TO_DAY_ENV } from './config';
import { createRetailerSource } from './createRetailerSource';
import { CHEDRAUI_DISCOVERY_SURFACES } from './surfaces';
import type { HunterSource } from '../types';

export const chedrauiSource: HunterSource = createRetailerSource({
  id: 'chedraui_mx',
  displayName: 'Chedraui',
  storeLabel: 'Chedraui',
  country: 'MX',
  priority: 82,
  enabledEnv: DAY_TO_DAY_ENV.chedraui_mx,
  discoveryEnv: DAY_TO_DAY_ENV.chedraui_mx_discovery,
  origin: 'https://www.chedraui.com.mx',
  robotsUrl: 'https://www.chedraui.com.mx/robots.txt',
  productSitemapUrls: ['https://www.chedraui.com.mx/sitemap/product-0.xml'],
  fixtureFile: 'chedraui-promotions.json',
  compliance: 'READY',
  surfaces: CHEDRAUI_DISCOVERY_SURFACES,
});

export const bodegaSource: HunterSource = createRetailerSource({
  id: 'bodega_aurrera_mx',
  displayName: 'Bodega Aurrera',
  storeLabel: 'Bodega Aurrera',
  country: 'MX',
  priority: 81,
  enabledEnv: DAY_TO_DAY_ENV.bodega_aurrera_mx,
  discoveryEnv: DAY_TO_DAY_ENV.bodega_aurrera_mx_discovery,
  origin: 'https://www.bodegaaurrera.com.mx',
  robotsUrl: 'https://www.bodegaaurrera.com.mx/robots.txt',
  productSitemapUrls: ['https://www.bodegaaurrera.com.mx/productSitemap.xml'],
  fixtureFile: 'bodega-promotions.json',
  compliance: 'DEGRADED',
});

export const walmartSource: HunterSource = createRetailerSource({
  id: 'walmart_mx',
  displayName: 'Walmart México',
  storeLabel: 'Walmart',
  country: 'MX',
  priority: 80,
  enabledEnv: DAY_TO_DAY_ENV.walmart_mx,
  discoveryEnv: DAY_TO_DAY_ENV.walmart_mx_discovery,
  origin: 'https://www.walmart.com.mx',
  robotsUrl: 'https://www.walmart.com.mx/robots.txt',
  productSitemapUrls: ['https://www.walmart.com.mx/productSitemap.xml'],
  fixtureFile: 'walmart-promotions.json',
  compliance: 'DEGRADED',
});
