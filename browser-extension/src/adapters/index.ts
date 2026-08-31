import type { ExtractedProduct, StoreAdapter } from '../types/product';
import { amazonAdapter } from './amazon';
import { mercadoLibreAdapter } from './mercadoLibre';

export const STORE_ADAPTERS: StoreAdapter[] = [amazonAdapter, mercadoLibreAdapter];

export function resolveAdapter(url: string): StoreAdapter | null {
  return STORE_ADAPTERS.find((a) => a.canHandle(url)) ?? null;
}

export function extractFromPage(doc: Document, pageUrl: string): ExtractedProduct | null {
  const adapter = resolveAdapter(pageUrl);
  if (!adapter) return null;
  return adapter.extractProduct(doc, pageUrl);
}

export { amazonAdapter, mercadoLibreAdapter };
export * from './amazon';
export * from './mercadoLibre';
