import type { HunterSource, HunterSourceConfigState, HunterSourceId } from '../types';
import { DAY_TO_DAY_ENV } from './config';
import { createUnconfiguredRetailerSource } from './unconfiguredRetailer';

/**
 * Registro Day-to-Day. Agregar una fuente = un adapter + una entrada aquí.
 * No se copia el pipeline.
 *
 * Ninguna está configurada: no hay API oficial, feed ni sitemap usable
 * sin evadir controles. Eso no es una avería.
 */
export const DAY_TO_DAY_SOURCES: HunterSource[] = [
  createUnconfiguredRetailerSource({
    id: 'walmart_mx',
    displayName: 'Walmart México',
    country: 'MX',
    priority: 80,
    enabledEnv: DAY_TO_DAY_ENV.walmart_mx,
  }),
  createUnconfiguredRetailerSource({
    id: 'bodega_aurrera_mx',
    displayName: 'Bodega Aurrera',
    country: 'MX',
    priority: 81,
    enabledEnv: DAY_TO_DAY_ENV.bodega_aurrera_mx,
  }),
  createUnconfiguredRetailerSource({
    id: 'chedraui_mx',
    displayName: 'Chedraui',
    country: 'MX',
    priority: 82,
    enabledEnv: DAY_TO_DAY_ENV.chedraui_mx,
  }),
];

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
