import type { HunterCollectResult, HunterSource, HunterSourceId } from '../types';
import type { IngestSourceId } from '@/lib/bots/ingest/types';
import { DAY_TO_DAY_RATE_POLICY, isDayToDayFlagOn } from './config';

type UnconfiguredRetailerSpec = {
  id: HunterSourceId & IngestSourceId;
  displayName: string;
  country: string;
  priority: number;
  enabledEnv: string;
};

/**
 * Adapter de retailer sin método de discovery usable.
 *
 * isConfigured = false → el motor no llama collect.
 * collect, si alguien lo invocara, no hace red: devolver vacío no es un fallo.
 */
export function createUnconfiguredRetailerSource(spec: UnconfiguredRetailerSpec): HunterSource {
  return {
    id: spec.id,
    ingestSourceId: spec.id,
    displayName: spec.displayName,
    priority: spec.priority,
    expectedIntervalMs: 60 * 60 * 1000,
    family: 'day_to_day',
    country: spec.country,
    capabilities: {
      discovery: false,
      productLookup: false,
      images: false,
      price: false,
    },
    discoveryMethod: 'not_available',
    affiliateStatus: 'unknown',
    ratePolicy: { ...DAY_TO_DAY_RATE_POLICY },
    isEnabled: () => isDayToDayFlagOn(spec.enabledEnv),
    isAvailable: () => false,
    isConfigured: () => false,
    async collect(): Promise<HunterCollectResult> {
      return {
        ok: true,
        candidates: [],
        itemsFound: 0,
        collectedCount: 0,
        errorCode: 'not_configured',
        errorMessageSafe: `${spec.id} no tiene método de discovery configurado`,
      };
    },
  };
}
