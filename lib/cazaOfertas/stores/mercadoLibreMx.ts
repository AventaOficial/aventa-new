/**
 * CazaOfertasss — FASE 0. Adapter stub: Mercado Libre México.
 *
 * Estado: SOLO CONTRATO. No se implementa ninguna llamada de red.
 *
 * Mercado Libre publica una API oficial de items, pero en FASE 0 no tenemos
 * credenciales de aplicación aprobadas ni política de rate limit acordada, y el
 * programa de afiliados no expone (públicamente y de forma confirmada) un
 * endpoint de generación de links. Por eso todas las capacidades quedan
 * `unknown`/`unsupported` en vez de fingir soporte.
 */

import type { CazaResult } from '../types';
import type {
  CreateAffiliateLinkInput,
  DealStoreAdapter,
  DealStoreCapabilities,
  DiscoverQuery,
} from './adapter';
import { capabilityUnavailable } from './adapter';

export const MERCADO_LIBRE_MX_CAPABILITIES: DealStoreCapabilities = {
  discover: 'unknown',
  getProduct: 'unknown',
  validatePrice: 'unknown',
  createAffiliateLink: 'unsupported',
  notes: [
    'Existe API oficial de items, pero FASE 0 no tiene credenciales aprobadas.',
    'Generación programática de links de afiliado: sin integración oficial confirmada.',
    'No se permite scraping ni endpoints no documentados.',
  ],
};

export function createMercadoLibreMxAdapter(): DealStoreAdapter {
  const store = 'mercadolibre_mx' as const;
  return {
    store,
    capabilities: MERCADO_LIBRE_MX_CAPABILITIES,

    async discover(_query: DiscoverQuery): Promise<CazaResult<never>> {
      void _query;
      return capabilityUnavailable(store, 'discover', MERCADO_LIBRE_MX_CAPABILITIES.discover);
    },

    async getProduct(_externalProductId: string): Promise<CazaResult<never>> {
      void _externalProductId;
      return capabilityUnavailable(store, 'getProduct', MERCADO_LIBRE_MX_CAPABILITIES.getProduct);
    },

    async validatePrice(
      _externalProductId: string,
      _expectedPrice: number
    ): Promise<CazaResult<never>> {
      void _externalProductId;
      void _expectedPrice;
      return capabilityUnavailable(
        store,
        'validatePrice',
        MERCADO_LIBRE_MX_CAPABILITIES.validatePrice
      );
    },

    async createAffiliateLink(_input: CreateAffiliateLinkInput): Promise<CazaResult<never>> {
      void _input;
      return capabilityUnavailable(
        store,
        'createAffiliateLink',
        MERCADO_LIBRE_MX_CAPABILITIES.createAffiliateLink
      );
    },
  };
}
