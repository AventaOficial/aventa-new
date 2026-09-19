/**
 * CazaOfertasss — FASE 0. Registro de adapters.
 *
 * El registro es cerrado: una tienda sin adapter registrado no puede entrar al
 * pipeline. Agregar una tienda es una decisión explícita.
 */

import { CAZAOFERTAS_STORES } from '../constants';
import type { CazaStoreId } from '../types';
import type { DealStoreAdapter, DealStoreCapabilities } from './adapter';
import { createAmazonMxAdapter } from './amazonMx';
import { createMercadoLibreMxAdapter } from './mercadoLibreMx';

export type DealStoreAdapterRegistry = Readonly<Record<CazaStoreId, DealStoreAdapter>>;

export function createDealStoreAdapterRegistry(): DealStoreAdapterRegistry {
  return {
    mercadolibre_mx: createMercadoLibreMxAdapter(),
    amazon_mx: createAmazonMxAdapter(),
  };
}

export function listRegisteredStores(): readonly CazaStoreId[] {
  return CAZAOFERTAS_STORES;
}

export function capabilitiesMatrix(
  registry: DealStoreAdapterRegistry
): Readonly<Record<CazaStoreId, DealStoreCapabilities>> {
  return {
    mercadolibre_mx: registry.mercadolibre_mx.capabilities,
    amazon_mx: registry.amazon_mx.capabilities,
  };
}
