import { amazonAsinSource } from './amazonAsin';
import { amazonPaapiSource } from './amazonPaapi';
import { envUrlsSource } from './envUrls';
import { mlApiLegacySource } from './mlApiLegacy';
import { mlWorkerSource } from './mlWorker';
import { DAY_TO_DAY_SOURCES } from '../dayToDay';
import type { HunterSource } from '../types';

export const HUNTER_SOURCES: HunterSource[] = [
  mlApiLegacySource,
  mlWorkerSource,
  amazonPaapiSource,
  amazonAsinSource,
  envUrlsSource,
  ...DAY_TO_DAY_SOURCES,
].sort((a, b) => a.priority - b.priority);

export {
  mlApiLegacySource,
  mlWorkerSource,
  amazonPaapiSource,
  amazonAsinSource,
  envUrlsSource,
};
