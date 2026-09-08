import type { IngestItem } from '@/lib/bots/ingest/types';
import type { BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  applyBreakerTransition,
  shouldAttemptCollect,
} from './circuitBreaker';
import {
  defaultHealthRow,
  getHunterHealth,
  recordHunterFailure,
  recordHunterRun,
  recordHunterSuccess,
  safeErrorMessage,
} from './healthStore';
import { dedupeHunterCandidates } from './normalize';
import { HUNTER_SOURCES } from './sources';
import type {
  HunterCandidate,
  HunterCollectContext,
  HunterEngineCollectResult,
  HunterRunMetrics,
  HunterSource,
  HunterSourceHealth,
  HunterSourceId,
} from './types';

export type RunHunterCollectOptions = {
  config: BotIngestConfig;
  rotationWave: number;
  now?: Date;
  sources?: HunterSource[];
  /** Si false, no persiste health (tests unitarios del orquestador). */
  persistHealth?: boolean;
};

function rotateItems(
  bySource: Partial<Record<HunterSourceId, IngestItem[]>>,
  config: BotIngestConfig,
  rotationWave: number
): IngestItem[] {
  const ml = bySource.ml_api_legacy ?? [];
  const amazon = [...(bySource.amazon_paapi ?? []), ...(bySource.amazon_asin ?? [])];
  const env = bySource.env_urls ?? [];
  const dayToDay = [
    ...(bySource.walmart_mx ?? []),
    ...(bySource.bodega_aurrera_mx ?? []),
    ...(bySource.chedraui_mx ?? []),
  ];
  const w = ((rotationWave % 3) + 3) % 3;
  const segments: IngestItem[][] =
    config.amazonSource === 'scrape'
      ? [ml, env, amazon]
      : w === 0
        ? [ml, amazon, env]
        : w === 1
          ? [amazon, ml, env]
          : [ml, env, amazon];
  const items: IngestItem[] = [];
  for (const seg of segments) items.push(...seg);
  // Day-to-Day al final: no desplaza el supply core mientras esté vacío.
  items.push(...dayToDay);
  return items;
}

async function loadHealthMap(
  sources: HunterSource[]
): Promise<Map<HunterSourceId, HunterSourceHealth>> {
  const ids = sources.map((s) => s.id);
  const rows = await getHunterHealth(ids);
  const map = new Map<HunterSourceId, HunterSourceHealth>();
  for (const id of ids) {
    const row = rows.find((r) => r.sourceId === id);
    const src = sources.find((s) => s.id === id)!;
    map.set(
      id,
      row
        ? { ...row, expectedIntervalMs: src.expectedIntervalMs }
        : defaultHealthRow(id, { expectedIntervalMs: src.expectedIntervalMs })
    );
  }
  return map;
}

/**
 * Orquesta collect por fuente con aislamiento de errores + circuit breaker.
 * No hace score/insert: solo produce IngestItem[] para el pipeline existente.
 */
export async function runHunterCollect(
  options: RunHunterCollectOptions
): Promise<HunterEngineCollectResult> {
  const now = options.now ?? new Date();
  const persist = options.persistHealth !== false;
  const sources = options.sources ?? HUNTER_SOURCES;
  const ctx: HunterCollectContext = {
    config: options.config,
    rotationWave: options.rotationWave,
    now,
  };

  const healthMap = await loadHealthMap(sources);
  const sourceRuns: HunterRunMetrics[] = [];
  const allCandidates: HunterCandidate[] = [];
  const diagnostics: HunterEngineCollectResult['discoveryDiagnostics'] = {};
  const bySourceItems: Partial<Record<HunterSourceId, IngestItem[]>> = {};

  for (const source of sources) {
    const enabled = source.isEnabled(ctx);
    const available = source.isAvailable(ctx);
    let health = healthMap.get(source.id) ?? defaultHealthRow(source.id);

    if (!enabled || !available) {
      const configured = source.isConfigured ? source.isConfigured(ctx) : available;
      const disabledRow: HunterSourceHealth = {
        ...health,
        enabled: false,
        status: 'disabled',
        breakerState: 'closed',
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastErrorCode: configured
          ? null
          : source.family === 'day_to_day'
            ? 'not_configured'
            : 'missing_credentials_or_config',
        lastErrorMessageSafe: configured
          ? null
          : source.family === 'day_to_day'
            ? 'Fuente Day-to-Day sin método de discovery'
            : 'Fuente sin credenciales o config requerida',
        expectedIntervalMs: source.expectedIntervalMs,
        updatedAt: now.toISOString(),
      };
      healthMap.set(source.id, disabledRow);
      if (persist) await recordHunterRun(disabledRow);
      sourceRuns.push({
        sourceId: source.id,
        ok: true,
        skippedByBreaker: false,
        skippedDisabled: true,
        latencyMs: 0,
        itemsFound: 0,
        itemsInserted: 0,
        duplicates: 0,
        skipped: 0,
        errors: 0,
      });
      continue;
    }

    // Fuentes externas: no collect inline; solo sincroniza enabled/health base.
    if (source.external) {
      const externalRow: HunterSourceHealth = {
        ...health,
        enabled: true,
        status: health.status === 'down' ? 'down' : health.lastSuccessAt ? health.status : 'degraded',
        expectedIntervalMs: source.expectedIntervalMs,
        updatedAt: now.toISOString(),
      };
      healthMap.set(source.id, externalRow);
      if (persist) await recordHunterRun(externalRow);
      sourceRuns.push({
        sourceId: source.id,
        ok: true,
        skippedByBreaker: false,
        skippedDisabled: false,
        latencyMs: 0,
        itemsFound: 0,
        itemsInserted: 0,
        duplicates: 0,
        skipped: 0,
        errors: 0,
      });
      continue;
    }

    health = { ...health, enabled: true, expectedIntervalMs: source.expectedIntervalMs };
    const gate = shouldAttemptCollect(health, now);
    if (!gate.attempt) {
      sourceRuns.push({
        sourceId: source.id,
        ok: false,
        skippedByBreaker: true,
        skippedDisabled: false,
        latencyMs: 0,
        itemsFound: 0,
        itemsInserted: 0,
        duplicates: 0,
        skipped: 0,
        errors: 0,
        errorCode: health.lastErrorCode,
        errorMessageSafe: 'breaker_open_cooldown',
      });
      continue;
    }

    const probedAsHalfOpen = gate.nextBreaker === 'half_open' || health.breakerState === 'half_open';
    if (probedAsHalfOpen && persist) {
      await recordHunterRun({
        ...health,
        breakerState: 'half_open',
        status: 'degraded',
        lastRunAt: now.toISOString(),
      });
    }

    const t0 = Date.now();
    try {
      const result = await source.collect(ctx);
      const latencyMs = Date.now() - t0;

      const ingestSource = source.ingestSourceId;
      diagnostics[ingestSource] = {
        collectedCount: result.collectedCount ?? result.itemsFound,
        skipReasonCounts: result.skipReasonCounts,
      };

      if (!result.ok) {
        const transition = applyBreakerTransition({
          previous: health,
          now,
          collectOk: false,
          errorCode: result.errorCode,
          itemsFound: 0,
          probedAsHalfOpen,
        });
        if (persist) {
          await recordHunterFailure(source.id, {
            errorCode: result.errorCode,
            errorMessageSafe: result.errorMessageSafe ?? safeErrorMessage(result.errorCode),
            latencyMs,
            expectedIntervalMs: source.expectedIntervalMs,
            status: transition.status,
            breakerState: transition.breakerState,
            consecutiveFailures: transition.consecutiveFailures,
            cooldownUntil: transition.cooldownUntil,
          });
        }
        healthMap.set(source.id, {
          ...health,
          ...transition,
          lastRunAt: now.toISOString(),
          lastErrorCode: result.errorCode ?? null,
          lastErrorMessageSafe: result.errorMessageSafe ?? null,
          latencyMs,
          itemsFound: 0,
        });
        sourceRuns.push({
          sourceId: source.id,
          ok: false,
          skippedByBreaker: false,
          skippedDisabled: false,
          latencyMs,
          itemsFound: 0,
          itemsInserted: 0,
          duplicates: 0,
          skipped: 0,
          errors: 1,
          errorCode: result.errorCode,
          errorMessageSafe: result.errorMessageSafe,
        });
        continue;
      }

      // ok — zero results sin error HTTP = soft (no abre breaker)
      const softZero = result.itemsFound === 0;
      const transition = applyBreakerTransition({
        previous: health,
        now,
        collectOk: true,
        itemsFound: result.itemsFound,
        softZeroResult: softZero,
        probedAsHalfOpen,
      });

      allCandidates.push(...result.candidates);
      bySourceItems[source.id] = result.candidates.map((c) => c.ingestItem);

      if (persist) {
        await recordHunterSuccess(source.id, {
          itemsFound: result.itemsFound,
          latencyMs,
          expectedIntervalMs: source.expectedIntervalMs,
          status: transition.status,
          breakerState: transition.breakerState,
          consecutiveFailures: 0,
          cooldownUntil: null,
        });
      }
      healthMap.set(source.id, {
        ...health,
        ...transition,
        lastRunAt: now.toISOString(),
        latencyMs,
        itemsFound: result.itemsFound,
        lastErrorCode: null,
        lastErrorMessageSafe: null,
      });
      sourceRuns.push({
        sourceId: source.id,
        ok: true,
        skippedByBreaker: false,
        skippedDisabled: false,
        latencyMs,
        itemsFound: result.itemsFound,
        itemsInserted: 0,
        duplicates: 0,
        skipped: 0,
        errors: 0,
      });
    } catch (e) {
      const latencyMs = Date.now() - t0;
      const msg = safeErrorMessage(e);
      const errorCode =
        /timeout/i.test(msg) ? 'timeout' : /network|fetch failed/i.test(msg) ? 'network' : 'exception';
      const transition = applyBreakerTransition({
        previous: health,
        now,
        collectOk: false,
        errorCode,
        itemsFound: 0,
        probedAsHalfOpen,
      });
      if (persist) {
        await recordHunterFailure(source.id, {
          errorCode,
          errorMessageSafe: msg,
          latencyMs,
          expectedIntervalMs: source.expectedIntervalMs,
          status: transition.status,
          breakerState: transition.breakerState,
          consecutiveFailures: transition.consecutiveFailures,
          cooldownUntil: transition.cooldownUntil,
        });
      }
      healthMap.set(source.id, {
        ...health,
        ...transition,
        lastRunAt: now.toISOString(),
        lastErrorCode: errorCode,
        lastErrorMessageSafe: msg,
        latencyMs,
      });
      sourceRuns.push({
        sourceId: source.id,
        ok: false,
        skippedByBreaker: false,
        skippedDisabled: false,
        latencyMs,
        itemsFound: 0,
        itemsInserted: 0,
        duplicates: 0,
        skipped: 0,
        errors: 1,
        errorCode,
        errorMessageSafe: msg,
      });
      // Continúa con las demás fuentes
    }
  }

  const deduped = dedupeHunterCandidates(allCandidates);
  const dedupedBySource: Partial<Record<HunterSourceId, IngestItem[]>> = {};
  for (const c of deduped) {
    const list = dedupedBySource[c.source] ?? [];
    list.push(c.ingestItem);
    dedupedBySource[c.source] = list;
  }

  const items = rotateItems(dedupedBySource, options.config, options.rotationWave);

  return {
    items,
    candidates: deduped,
    discoveryDiagnostics: diagnostics,
    sourceRuns,
    healthSnapshot: [...healthMap.values()],
  };
}

/** Registra métricas post-insert para una fuente externa (ml_worker). */
export async function recordExternalSourceBatchHealth(input: {
  sourceId: HunterSourceId;
  ok: boolean;
  itemsFound: number;
  itemsInserted: number;
  duplicates: number;
  skipped: number;
  errors: number;
  latencyMs: number;
  errorCode?: string | null;
  errorMessageSafe?: string | null;
  expectedIntervalMs?: number;
}): Promise<void> {
  const now = new Date();
  const [prev] = await getHunterHealth([input.sourceId]);
  const health = prev ?? defaultHealthRow(input.sourceId, {
    expectedIntervalMs: input.expectedIntervalMs ?? 30 * 60 * 1000,
  });

  if (input.ok) {
    const transition = applyBreakerTransition({
      previous: { ...health, enabled: true },
      now,
      collectOk: true,
      itemsFound: input.itemsFound,
      softZeroResult: input.itemsFound === 0 && input.errors === 0,
      probedAsHalfOpen: health.breakerState === 'half_open',
    });
    await recordHunterSuccess(input.sourceId, {
      itemsFound: input.itemsFound,
      itemsInserted: input.itemsInserted,
      duplicates: input.duplicates,
      skipped: input.skipped,
      errors: input.errors,
      latencyMs: input.latencyMs,
      expectedIntervalMs: input.expectedIntervalMs ?? 30 * 60 * 1000,
      status: transition.status,
      breakerState: transition.breakerState,
    });
    return;
  }

  const transition = applyBreakerTransition({
    previous: { ...health, enabled: true },
    now,
    collectOk: false,
    errorCode: input.errorCode,
    itemsFound: 0,
    probedAsHalfOpen: health.breakerState === 'half_open',
  });
  await recordHunterFailure(input.sourceId, {
    errorCode: input.errorCode,
    errorMessageSafe: input.errorMessageSafe,
    itemsFound: input.itemsFound,
    latencyMs: input.latencyMs,
    expectedIntervalMs: input.expectedIntervalMs ?? 30 * 60 * 1000,
    status: transition.status,
    breakerState: transition.breakerState,
    consecutiveFailures: transition.consecutiveFailures,
    cooldownUntil: transition.cooldownUntil,
  });
}
