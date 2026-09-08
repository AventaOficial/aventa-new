import { describe, expect, it } from 'vitest';
import { applyBreakerTransition, cooldownMsForErrorCode } from '@/lib/hunter/circuitBreaker';
import { defaultHealthRow } from '@/lib/hunter/healthStore';
import { evaluateIsHunting, deriveHuntingLevel } from '@/lib/hunter/isHunting';
import { classifySchedulerHealth, summarizeSchedulerHealth } from '@/lib/hunter/schedulerHealth';
import { runHunterCollect } from '@/lib/hunter/engine';
import { ingestItemToCandidate } from '@/lib/hunter/normalize';
import { DAY_TO_DAY_SOURCES, summarizeDayToDaySupply } from '@/lib/hunter/dayToDay';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { HunterCollectResult, HunterSource } from '@/lib/hunter/types';

const NOW = new Date('2026-09-08T20:00:00.000Z');

function configured(over: Parameters<typeof defaultHealthRow>[1] = {}) {
  return defaultHealthRow('ml_worker', {
    enabled: true,
    status: 'healthy',
    breakerState: 'closed',
    lastRunAt: '2026-09-08T19:50:00.000Z',
    lastSuccessAt: '2026-09-08T19:50:00.000Z',
    itemsFound: 10,
    itemsInserted: 2,
    ...over,
  });
}

function disabledRow() {
  return defaultHealthRow('amazon_asin', {
    enabled: false,
    status: 'disabled',
    breakerState: 'closed',
    lastErrorCode: 'missing_credentials_or_config',
    itemsFound: 99,
    itemsInserted: 50,
    lastSuccessAt: '2026-09-08T19:50:00.000Z',
    lastRunAt: '2026-09-08T19:50:00.000Z',
  });
}

function notConfiguredRow() {
  return defaultHealthRow('walmart_mx', {
    enabled: false,
    status: 'disabled',
    breakerState: 'closed',
    lastErrorCode: 'not_configured',
    itemsFound: 0,
    itemsInserted: 0,
  });
}

describe('semántica de health: disabled / not_configured ≠ down', () => {
  it('disabled source != down para isHunting', () => {
    const out = evaluateIsHunting([disabledRow()], NOW);
    expect(out.isHunting).toBe(false);
    expect(out.sources[0]!.status).toBe('disabled');
    expect(out.sources[0]!.status).not.toBe('down');
  });

  it('not_configured source != down para isHunting', () => {
    const out = evaluateIsHunting([notConfiguredRow()], NOW);
    expect(out.sources[0]!.status).toBe('disabled');
    expect(out.sources[0]!.status).not.toBe('down');
    expect(out.isHunting).toBe(false);
  });

  it('disabled no sostiene isHunting aunque tenga inserts recientes', () => {
    // El hunter core caído no se “salva” con basura persistida de una fuente apagada.
    const out = evaluateIsHunting(
      [
        configured({
          sourceId: 'ml_api_legacy',
          status: 'down',
          breakerState: 'open',
          itemsFound: 0,
          itemsInserted: 0,
          cooldownUntil: '2026-09-08T21:00:00.000Z',
        }),
        disabledRow(),
      ],
      NOW
    );
    expect(out.isHunting).toBe(false);
  });

  it('not_configured no sostiene ni tumba isHunting de una fuente sana', () => {
    const healthy = evaluateIsHunting([configured(), notConfiguredRow()], NOW);
    expect(healthy.isHunting).toBe(true);

    const onlyDtd = evaluateIsHunting([notConfiguredRow()], NOW);
    expect(onlyDtd.isHunting).toBe(false);
  });

  it('Day-to-Day no cuenta down/healthy sobre filas not_configured', () => {
    const snap = summarizeDayToDaySupply([
      defaultHealthRow('walmart_mx', {
        status: 'down',
        enabled: false,
        lastErrorCode: 'not_configured',
        itemsFound: 0,
      }),
      defaultHealthRow('bodega_aurrera_mx', {
        status: 'healthy',
        enabled: false,
        lastErrorCode: 'not_configured',
      }),
    ]);
    expect(snap.sourcesNotConfigured).toBe(3);
    expect(snap.sourcesConfigured).toBe(0);
    expect(snap.sourcesDown).toBe(0);
    expect(snap.sourcesHealthy).toBe(0);
    expect(snap.recommendation).toMatch(/no configured sources/i);
  });

  it('scheduler: not_configured es disabled, nunca down', () => {
    const out = classifySchedulerHealth(
      {
        sourceId: 'walmart_mx',
        enabled: true,
        lastRunAt: null,
        expectedIntervalMs: 60 * 60 * 1000,
        consecutiveFailures: 0,
        lastErrorCode: 'not_configured',
      },
      NOW
    );
    expect(out.state).toBe('disabled');
    expect(out.state).not.toBe('down');
  });

  it('scheduler: disabled no mueve worstState a down', () => {
    const out = summarizeSchedulerHealth(
      [
        {
          sourceId: 'ml_worker',
          enabled: true,
          lastRunAt: '2026-09-08T19:50:00.000Z',
          expectedIntervalMs: 30 * 60 * 1000,
          consecutiveFailures: 0,
        },
        {
          sourceId: 'walmart_mx',
          enabled: false,
          lastRunAt: null,
          expectedIntervalMs: 60 * 60 * 1000,
          consecutiveFailures: 0,
          lastErrorCode: 'not_configured',
        },
      ],
      NOW
    );
    expect(out.worstState).toBe('healthy');
    expect(out.needsAttention).toBe(false);
  });

  it('huntingLevel no trata disabled-only como señal de fuente caída distinta', () => {
    // El nivel agregado sigue siendo 'down' solo cuando no hay healthy/degraded.
    // disabled no aporta un 'down' extra.
    expect(deriveHuntingLevel([{ displayStatus: 'disabled' }], false)).toBe('down');
    expect(
      deriveHuntingLevel([{ displayStatus: 'healthy' }, { displayStatus: 'disabled' }], true)
    ).toBe('healthy');
  });
});

describe('semántica de health: fuentes configuradas', () => {
  it('403 → down tras umbral de fallos, no por estar disabled', () => {
    const out = applyBreakerTransition({
      previous: configured({ consecutiveFailures: 2 }),
      now: NOW,
      collectOk: false,
      errorCode: '403',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.status).toBe('down');
    expect(out.breakerState).toBe('open');
    expect(cooldownMsForErrorCode('403')).toBe(60 * 60 * 1000);
  });

  it('zero results → no es fallo (breaker cerrado, no down)', () => {
    // Política existente: yield vacío sano = degraded, no down. No se cambia.
    const out = applyBreakerTransition({
      previous: configured({ consecutiveFailures: 2 }),
      now: NOW,
      collectOk: true,
      itemsFound: 0,
      softZeroResult: true,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('closed');
    expect(out.consecutiveFailures).toBe(0);
    expect(out.status).not.toBe('down');
  });

  it('timeout → failure', () => {
    const out = applyBreakerTransition({
      previous: configured({ consecutiveFailures: 2 }),
      now: NOW,
      collectOk: false,
      errorCode: 'timeout',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('open');
    expect(out.status).toBe('down');
  });

  it('429 → failure con cooldown mayor que 5xx', () => {
    expect(cooldownMsForErrorCode('429')).toBeGreaterThan(cooldownMsForErrorCode('500'));
    const out = applyBreakerTransition({
      previous: configured({ consecutiveFailures: 2 }),
      now: NOW,
      collectOk: false,
      errorCode: '429',
      itemsFound: 0,
      probedAsHalfOpen: false,
    });
    expect(out.breakerState).toBe('open');
  });

  it('aislamiento: 403 en una fuente no tumba a la otra', async () => {
    const bad: HunterSource = {
      id: 'walmart_mx',
      ingestSourceId: 'walmart_mx',
      displayName: 'Walmart',
      priority: 1,
      expectedIntervalMs: 60_000,
      family: 'day_to_day',
      isEnabled: () => true,
      isAvailable: () => true,
      isConfigured: () => true,
      async collect(): Promise<HunterCollectResult> {
        return { ok: false, candidates: [], itemsFound: 0, errorCode: '403' };
      },
    };
    const good: HunterSource = {
      id: 'chedraui_mx',
      ingestSourceId: 'chedraui_mx',
      displayName: 'Chedraui',
      priority: 2,
      expectedIntervalMs: 60_000,
      family: 'day_to_day',
      isEnabled: () => true,
      isAvailable: () => true,
      isConfigured: () => true,
      async collect(): Promise<HunterCollectResult> {
        return {
          ok: true,
          itemsFound: 1,
          candidates: [
            ingestItemToCandidate(
              { url: 'https://www.chedraui.com.mx/p/1', source: 'chedraui_mx' },
              'chedraui_mx'
            ),
          ],
        };
      },
    };

    const result = await runHunterCollect({
      config: loadBotIngestConfig('standard'),
      rotationWave: 0,
      persistHealth: false,
      sources: [bad, good],
    });
    expect(result.sourceRuns.find((r) => r.sourceId === 'walmart_mx')?.ok).toBe(false);
    expect(result.sourceRuns.find((r) => r.sourceId === 'chedraui_mx')?.ok).toBe(true);
    expect(result.items.some((i) => i.source === 'chedraui_mx')).toBe(true);
  });

  it('Day-to-Day registry no se activa ni abre breaker en un ciclo real', async () => {
    const result = await runHunterCollect({
      config: loadBotIngestConfig('standard'),
      rotationWave: 0,
      persistHealth: false,
      sources: DAY_TO_DAY_SOURCES,
    });
    expect(result.sourceRuns.every((r) => r.ok && r.skippedDisabled)).toBe(true);
    expect(result.healthSnapshot.every((r) => r.status === 'disabled')).toBe(true);
    expect(result.healthSnapshot.every((r) => r.breakerState === 'closed')).toBe(true);
    expect(result.healthSnapshot.every((r) => r.consecutiveFailures === 0)).toBe(true);
    expect(result.healthSnapshot.every((r) => r.lastErrorCode === 'not_configured')).toBe(true);
  });
});
