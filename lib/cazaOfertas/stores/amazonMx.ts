/**
 * CazaOfertasss — FASE 0. Adapter stub: Amazon México.
 *
 * Estado: SOLO CONTRATO. No se implementa ninguna llamada de red.
 *
 * Amazon ofrece la Product Advertising API para asociados, pero requiere una
 * cuenta aprobada con ventas calificadas antes de emitir credenciales. Hasta
 * tenerlas, `discover`/`getProduct`/`validatePrice` quedan `unsupported`. Los
 * links de afiliado de Amazon se construyen con el tag de asociado sobre la URL
 * canónica; eso NO se hace aquí porque el tag es un secreto de entorno y la
 * generación pertenece a la capa de affiliate mapping operada.
 */

import type { CazaResult } from '../types';
import type {
  CreateAffiliateLinkInput,
  DealStoreAdapter,
  DealStoreCapabilities,
  DiscoverQuery,
} from './adapter';
import { capabilityUnavailable } from './adapter';

export const AMAZON_MX_CAPABILITIES: DealStoreCapabilities = {
  discover: 'unsupported',
  getProduct: 'unsupported',
  validatePrice: 'unsupported',
  createAffiliateLink: 'unsupported',
  notes: [
    'Product Advertising API requiere cuenta de asociado aprobada con ventas calificadas.',
    'FASE 0 no tiene credenciales PA-API; no se simula ni se scrapea.',
    'El tag de asociado es un secreto de entorno; el mapping afiliado es operado, no automático.',
  ],
};

export function createAmazonMxAdapter(): DealStoreAdapter {
  const store = 'amazon_mx' as const;
  return {
    store,
    capabilities: AMAZON_MX_CAPABILITIES,

    async discover(_query: DiscoverQuery): Promise<CazaResult<never>> {
      void _query;
      return capabilityUnavailable(store, 'discover', AMAZON_MX_CAPABILITIES.discover);
    },

    async getProduct(_externalProductId: string): Promise<CazaResult<never>> {
      void _externalProductId;
      return capabilityUnavailable(store, 'getProduct', AMAZON_MX_CAPABILITIES.getProduct);
    },

    async validatePrice(
      _externalProductId: string,
      _expectedPrice: number
    ): Promise<CazaResult<never>> {
      void _externalProductId;
      void _expectedPrice;
      return capabilityUnavailable(store, 'validatePrice', AMAZON_MX_CAPABILITIES.validatePrice);
    },

    async createAffiliateLink(_input: CreateAffiliateLinkInput): Promise<CazaResult<never>> {
      void _input;
      return capabilityUnavailable(
        store,
        'createAffiliateLink',
        AMAZON_MX_CAPABILITIES.createAffiliateLink
      );
    },
  };
}
