/**
 * Frontera de red de afiliados.
 * Growth lee el estado. No fabrica conversiones ni mueve dinero.
 */

export type AffiliateIngest = 'API' | 'MANUAL_IMPORT' | 'NOT_CONNECTED';

export type AffiliateNetworkBoundary = {
  id: string;
  ingest: AffiliateIngest;
  capabilities: Array<'click' | 'conversion' | 'commission' | 'confirmation' | 'reversal' | 'settlement'>;
};

export const AFFILIATE_NETWORK_BOUNDARIES: readonly AffiliateNetworkBoundary[] = [
  {
    id: 'mercadolibre',
    ingest: 'MANUAL_IMPORT',
    capabilities: ['click'],
  },
  {
    id: 'amazon',
    ingest: 'NOT_CONNECTED',
    capabilities: ['click'],
  },
] as const;
