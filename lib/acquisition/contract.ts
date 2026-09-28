import { OFFER_BATCH_MAX_ITEMS } from '@/lib/offers/batch/contract';

/** Tope de un envío. El mismo del lote: no hay una lógica distinta para 1, 10, 50 o 100. */
export const ACQUISITION_MAX_URLS = OFFER_BATCH_MAX_ITEMS;

export const ACQUISITION_MAX_TEXT_CHARS = 100_000;

/** Tope diario por scout. La autoridad de producto abierto sigue siendo el índice de lotes. */
export const ACQUISITION_SCOUT_DAILY_CAP = 500;

/**
 * Pasadas de extracción por envío. Cada una usa el chunk y el lease que ya tiene el lote.
 * 3 × 4 ítems. El resto queda INGESTED para la siguiente pasada del cron.
 */
export const ACQUISITION_PROCESS_MAX_CHUNKS = 3;

/** Chunks por ejecución del cron. El mismo presupuesto que el envío, para no alargar el request. */
export const ACQUISITION_CONTINUE_MAX_CHUNKS = 3;

/** No empieza otro chunk si ya pasó este plazo. El route sigue en maxDuration 60. */
export const ACQUISITION_CONTINUE_DEADLINE_MS = 45_000;

/** Filas más antiguas que se miran para armar la ronda. Un lote cabe en 100 ítems. */
export const ACQUISITION_CONTINUE_LOOKAHEAD = 400;

export const ACQUISITION_SOURCE_TYPES = ['automated', 'human', 'internal', 'external'] as const;
export type AcquisitionSourceType = (typeof ACQUISITION_SOURCE_TYPES)[number];

export type AcquisitionSourceSeed = {
  sourceKey: string;
  sourceType: AcquisitionSourceType;
  displayName: string;
  description: string;
};

export const ACQUISITION_SOURCES: readonly AcquisitionSourceSeed[] = [
  {
    sourceKey: 'chatgpt_deal_hunter',
    sourceType: 'automated',
    displayName: 'ChatGPT Deal Hunter',
    description: 'Tareas de ChatGPT que buscan ofertas.',
  },
  {
    sourceKey: 'chatgpt_everyday',
    sourceType: 'automated',
    displayName: 'ChatGPT Everyday',
    description: 'Tareas de ChatGPT de compra cotidiana.',
  },
  {
    sourceKey: 'chatgpt_promotions',
    sourceType: 'automated',
    displayName: 'ChatGPT Promotions',
    description: 'Tareas de ChatGPT de promociones.',
  },
  {
    sourceKey: 'human_scout',
    sourceType: 'human',
    displayName: 'Scout humano',
    description: 'Personas que entregan URLs. No publican.',
  },
  {
    sourceKey: 'admin_manual',
    sourceType: 'internal',
    displayName: 'Admin manual',
    description: 'Staff pega URLs al ledger de adquisición.',
  },
] as const;

export function isAcquisitionSourceKey(value: string): boolean {
  return ACQUISITION_SOURCES.some((source) => source.sourceKey === value);
}

export function acquisitionSourceSeed(sourceKey: string): AcquisitionSourceSeed | null {
  return ACQUISITION_SOURCES.find((source) => source.sourceKey === sourceKey) ?? null;
}
