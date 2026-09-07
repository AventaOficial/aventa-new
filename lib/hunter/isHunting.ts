import { deriveDisplayStatus } from './circuitBreaker';
import { getHunterHealth } from './healthStore';
import type { HunterSourceHealth, HunterSourceId } from './types';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type IsHuntingResult = {
  isHunting: boolean;
  reason: string;
  lastInsertAt: string | null;
  sources: Array<{
    sourceId: HunterSourceId;
    status: ReturnType<typeof deriveDisplayStatus>;
    itemsFound: number;
    itemsInserted: number;
  }>;
};

/**
 * TRUE si al menos una fuente healthy/degraded con items_found>0 en 6h
 * o items_inserted>0 en 24h.
 * FALSE si todas down/disabled en la ventana.
 */
export function evaluateIsHunting(
  rows: HunterSourceHealth[],
  now = new Date()
): IsHuntingResult {
  const nowMs = now.getTime();
  let lastInsertAt: string | null = null;

  const mapped = rows.map((row) => {
    const status = deriveDisplayStatus(row, now);
    if (row.itemsInserted > 0 && row.lastSuccessAt) {
      if (!lastInsertAt || row.lastSuccessAt > lastInsertAt) lastInsertAt = row.lastSuccessAt;
    }
    return {
      sourceId: row.sourceId,
      status,
      itemsFound: row.itemsFound,
      itemsInserted: row.itemsInserted,
      lastSuccessAt: row.lastSuccessAt,
      lastRunAt: row.lastRunAt,
      row,
    };
  });

  const active = mapped.filter((s) => s.status === 'healthy' || s.status === 'degraded');
  if (active.length === 0) {
    return {
      isHunting: false,
      reason: 'Todas las fuentes están down o disabled',
      lastInsertAt,
      sources: mapped.map(({ sourceId, status, itemsFound, itemsInserted }) => ({
        sourceId,
        status,
        itemsFound,
        itemsInserted,
      })),
    };
  }

  const foundRecently = active.some((s) => {
    if (s.itemsFound <= 0) return false;
    const t = s.lastSuccessAt ?? s.lastRunAt;
    if (!t) return false;
    return nowMs - new Date(t).getTime() <= SIX_HOURS_MS;
  });

  const insertedRecently = mapped.some((s) => {
    if (s.itemsInserted <= 0) return false;
    const t = s.lastSuccessAt;
    if (!t) return false;
    return nowMs - new Date(t).getTime() <= TWENTY_FOUR_HOURS_MS;
  });

  if (foundRecently || insertedRecently) {
    return {
      isHunting: true,
      reason: foundRecently
        ? 'Al menos una fuente activa encontró candidatos en las últimas 6h'
        : 'Hubo inserts del cazador en las últimas 24h',
      lastInsertAt,
      sources: mapped.map(({ sourceId, status, itemsFound, itemsInserted }) => ({
        sourceId,
        status,
        itemsFound,
        itemsInserted,
      })),
    };
  }

  return {
    isHunting: false,
    reason: 'Fuentes activas sin yield reciente (6h found / 24h insert)',
    lastInsertAt,
    sources: mapped.map(({ sourceId, status, itemsFound, itemsInserted }) => ({
      sourceId,
      status,
      itemsFound,
      itemsInserted,
    })),
  };
}

export async function isHunterHealthy(now = new Date()): Promise<IsHuntingResult> {
  const rows = await getHunterHealth();
  return evaluateIsHunting(rows, now);
}

/** Alias de dominio pedido en el diseño. */
export async function getHunterHealthSummary(now = new Date()) {
  const rows = await getHunterHealth();
  const hunting = evaluateIsHunting(rows, now);
  return {
    ...hunting,
    rows: rows.map((r) => ({
      ...r,
      displayStatus: deriveDisplayStatus(r, now),
    })),
  };
}
