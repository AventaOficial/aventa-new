/**
 * System Health aggregation — fail-closed indicators for CEO.
 * No inventa estados verdes. unknown cuando falta data.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { parseSupplyEngineMode } from '@/lib/hunter/supply/nicheProfiles';
import type { AttributionTruthSnapshot } from '@/lib/attribution/buildAttributionTruth';

export type SystemHealthStatus = 'healthy' | 'degraded' | 'blocked' | 'unknown';

export type SystemHealthComponent = {
  id: string;
  status: SystemHealthStatus;
  detail: string;
};

export type SystemHealthSnapshot = {
  generatedAt: string;
  overall: SystemHealthStatus;
  components: SystemHealthComponent[];
  moneyPathFrozen: boolean;
  supplyWriteEnabled: boolean;
  supplyMode: string;
};

function worst(a: SystemHealthStatus, b: SystemHealthStatus): SystemHealthStatus {
  const rank: Record<SystemHealthStatus, number> = {
    healthy: 0,
    unknown: 1,
    degraded: 2,
    blocked: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

export async function buildSystemHealthSnapshot(input: {
  supabase?: SupabaseClient | null;
  integrityOk?: boolean | null;
  integrityFailedChecks?: number | null;
  pendingModeration?: number | null;
  attribution?: AttributionTruthSnapshot | null;
  priceMemoryOk?: boolean | null;
  writeQueueBacklog?: number | null;
}): Promise<SystemHealthSnapshot> {
  const components: SystemHealthComponent[] = [];

  const moneyFrozen = isMoneyPathFrozen();
  const writeEnabled = (() => {
    const v = (process.env.SUPPLY_ENGINE_WRITE ?? '').trim().toLowerCase();
    return v === '1' || v === 'true';
  })();
  const supplyMode = parseSupplyEngineMode(process.env.SUPPLY_ENGINE_MODE);

  components.push({
    id: 'supply',
    status: writeEnabled ? 'degraded' : 'healthy',
    detail: writeEnabled
      ? `WRITE=1 (mode=${supplyMode}) — unexpected for maturation`
      : `WRITE=0 mode=${supplyMode}`,
  });

  if (input.integrityOk === false) {
    components.push({
      id: 'database',
      status: 'blocked',
      detail: `Integrity failed (${input.integrityFailedChecks ?? '?'} checks)`,
    });
  } else if (input.integrityOk === true) {
    components.push({ id: 'database', status: 'healthy', detail: 'Integrity OK' });
  } else {
    components.push({ id: 'database', status: 'unknown', detail: 'Integrity cache unavailable' });
  }

  const pending = input.pendingModeration;
  if (pending == null) {
    components.push({ id: 'moderation', status: 'unknown', detail: 'No pending data' });
  } else if (pending >= 20) {
    components.push({
      id: 'moderation',
      status: 'degraded',
      detail: `Backlog ${pending}`,
    });
  } else {
    components.push({
      id: 'moderation',
      status: 'healthy',
      detail: `Backlog ${pending}`,
    });
  }

  if (input.attribution) {
    components.push({
      id: 'attribution',
      status: input.attribution.status,
      detail: input.attribution.note,
    });
  } else {
    components.push({ id: 'attribution', status: 'unknown', detail: 'No attribution snapshot' });
  }

  if (input.priceMemoryOk === false) {
    components.push({ id: 'price_memory', status: 'degraded', detail: 'Price Memory unhealthy' });
  } else if (input.priceMemoryOk === true) {
    components.push({ id: 'price_memory', status: 'healthy', detail: 'Price Memory OK' });
  } else {
    components.push({ id: 'price_memory', status: 'unknown', detail: 'PM status unknown' });
  }

  const wq = input.writeQueueBacklog;
  if (wq == null) {
    components.push({ id: 'worker', status: 'unknown', detail: 'Write queue unknown' });
  } else if (wq > 100) {
    components.push({ id: 'worker', status: 'degraded', detail: `Write queue backlog ${wq}` });
  } else {
    components.push({ id: 'worker', status: 'healthy', detail: `Write queue ${wq}` });
  }

  components.push({
    id: 'money',
    status: moneyFrozen ? 'healthy' : 'degraded',
    detail: moneyFrozen ? 'Money path frozen (fail-closed)' : 'Money path UNFROZEN',
  });

  // Cron: presence of integrity cache as proxy (no separate ping here).
  components.push({
    id: 'cron',
    status: input.integrityOk == null ? 'unknown' : 'healthy',
    detail: input.integrityOk == null ? 'No integrity cache from cron' : 'Integrity cron observed',
  });

  let overall: SystemHealthStatus = 'healthy';
  for (const c of components) overall = worst(overall, c.status);

  return {
    generatedAt: new Date().toISOString(),
    overall,
    components,
    moneyPathFrozen: moneyFrozen,
    supplyWriteEnabled: writeEnabled,
    supplyMode,
  };
}

/** Helper for callers that need a client. */
export async function buildSystemHealthWithClient(
  opts: Omit<Parameters<typeof buildSystemHealthSnapshot>[0], 'supabase'> & {
    supabase?: SupabaseClient | null;
  },
): Promise<SystemHealthSnapshot> {
  let client = opts.supabase ?? null;
  if (!client) {
    try {
      client = createServerClient();
    } catch {
      client = null;
    }
  }
  return buildSystemHealthSnapshot({ ...opts, supabase: client });
}
