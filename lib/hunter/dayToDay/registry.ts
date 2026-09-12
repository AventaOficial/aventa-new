import type { HunterSource, HunterSourceConfigState, HunterSourceId } from '../types';
import { chedrauiSource, bodegaSource, walmartSource } from './adapters';

/**
 * Registro Day-to-Day. Adapters reales con discovery OFF por defecto
 * (NOT_CONFIGURED hasta DAY_TO_DAY_*_DISCOVERY=1).
 */
export const DAY_TO_DAY_SOURCES: HunterSource[] = [walmartSource, bodegaSource, chedrauiSource];

export const DAY_TO_DAY_SOURCE_IDS: HunterSourceId[] = DAY_TO_DAY_SOURCES.map((s) => s.id);

export function isDayToDaySourceId(id: string): boolean {
  return DAY_TO_DAY_SOURCE_IDS.includes(id as HunterSourceId);
}

export function getDayToDaySource(id: string): HunterSource | undefined {
  return DAY_TO_DAY_SOURCES.find((s) => s.id === id);
}

export function configurationStateFor(source: HunterSource): HunterSourceConfigState {
  if (source.isConfigured && !source.isConfigured({ config: {} as never, rotationWave: 0 })) {
    return 'not_configured';
  }
  if (!source.isAvailable({ config: {} as never, rotationWave: 0 })) {
    return 'not_configured';
  }
  if (!source.isEnabled({ config: {} as never, rotationWave: 0 })) {
    return 'disabled';
  }
  return 'configured';
}
