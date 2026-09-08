import { describe, expect, it } from 'vitest';
import {
  classifySchedulerHealth,
  summarizeSchedulerHealth,
  SCHEDULER_TOLERANCE,
} from '@/lib/hunter/schedulerHealth';
import type { HunterSourceHealth, HunterSourceId } from '@/lib/hunter/types';

const NOW = new Date('2026-09-08T20:00:00.000Z');
const THIRTY_MIN = 30 * 60 * 1000;

type Row = Pick<
  HunterSourceHealth,
  'sourceId' | 'enabled' | 'lastRunAt' | 'expectedIntervalMs' | 'consecutiveFailures'
>;

function row(over: Partial<Row> = {}): Row {
  return {
    sourceId: 'ml_worker' as HunterSourceId,
    enabled: true,
    lastRunAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
    expectedIntervalMs: THIRTY_MIN,
    consecutiveFailures: 0,
    ...over,
  };
}

/** Última corrida hace `minutes` minutos. */
function ranMinutesAgo(minutes: number, over: Partial<Row> = {}): Row {
  return row({ lastRunAt: new Date(NOW.getTime() - minutes * 60 * 1000).toISOString(), ...over });
}

describe('FASE 5 salud del scheduler', () => {
  it('A. dentro del intervalo prometido es healthy', () => {
    expect(classifySchedulerHealth(ranMinutesAgo(10), NOW).state).toBe('healthy');
    // Justo en el borde de la tolerancia sigue siendo healthy.
    expect(classifySchedulerHealth(ranMinutesAgo(45), NOW).state).toBe('healthy');
  });

  it('B. retraso moderado es degraded, no una avería', () => {
    // Un cron puede llegar tarde. Eso no es lo mismo que dejar de llegar.
    expect(classifySchedulerHealth(ranMinutesAgo(60), NOW).state).toBe('degraded');
    expect(classifySchedulerHealth(ranMinutesAgo(89), NOW).state).toBe('degraded');
  });

  it('C. el caso real observado en producción sale como stale', () => {
    // GitHub Actions corría el worker cada 2-5 h prometiendo 30 min.
    expect(classifySchedulerHealth(ranMinutesAgo(150), NOW).state).toBe('stale');
    expect(classifySchedulerHealth(ranMinutesAgo(240), NOW).state).toBe('stale');
  });

  it('D. una ausencia prolongada es down', () => {
    expect(classifySchedulerHealth(ranMinutesAgo(60 * 8), NOW).state).toBe('down');
  });

  it('E. no saber cuándo corrió es down, nunca healthy', () => {
    // Fail-closed: la ausencia de dato no puede leerse como buena noticia.
    expect(classifySchedulerHealth(row({ lastRunAt: null }), NOW).state).toBe('down');
    expect(classifySchedulerHealth(row({ lastRunAt: 'no-es-fecha' }), NOW).state).toBe('down');
    expect(classifySchedulerHealth(row({ lastRunAt: '' }), NOW).state).toBe('down');
  });

  it('F. una fuente apagada a propósito es disabled, no down', () => {
    const out = classifySchedulerHealth(row({ enabled: false, lastRunAt: null }), NOW);
    expect(out.state).toBe('disabled');
  });

  it('G. las tolerancias son relativas al intervalo de cada fuente', () => {
    // 60 min sin correr: normal si prometes 60, tarde si prometes 15.
    const lento = classifySchedulerHealth(
      ranMinutesAgo(60, { expectedIntervalMs: 60 * 60 * 1000 }),
      NOW
    );
    const rapido = classifySchedulerHealth(
      ranMinutesAgo(60, { expectedIntervalMs: 15 * 60 * 1000 }),
      NOW
    );
    expect(lento.state).toBe('healthy');
    expect(rapido.state).toBe('stale');
  });

  it('H. un intervalo inválido cae a un valor por defecto en vez de romper', () => {
    const out = classifySchedulerHealth(ranMinutesAgo(5, { expectedIntervalMs: 0 }), NOW);
    expect(out.expectedIntervalMinutes).toBe(15);
    expect(out.state).toBe('healthy');
  });

  it('I. reporta corridas esperadas por día y la próxima esperada', () => {
    const out = classifySchedulerHealth(ranMinutesAgo(10), NOW);
    expect(out.expectedRunsPerDay).toBe(48);
    expect(out.hoursSinceLastRun).toBe(0.2);
    expect(out.expectedNextRunAt).toBe('2026-09-08T20:20:00.000Z');
  });

  it('J. el resumen expone el peor estado y ordena por gravedad', () => {
    const out = summarizeSchedulerHealth(
      [
        ranMinutesAgo(5, { sourceId: 'ml_worker' as HunterSourceId }),
        ranMinutesAgo(60 * 10, { sourceId: 'ml_api_legacy' as HunterSourceId }),
        row({ sourceId: 'amazon_asin' as HunterSourceId, enabled: false }),
      ],
      NOW
    );
    expect(out.worstState).toBe('down');
    expect(out.needsAttention).toBe(true);
    expect(out.sources[0]!.sourceId).toBe('ml_api_legacy');
    expect(out.sources.at(-1)!.state).toBe('disabled');
  });

  it('K. si todo está sano no pide atención', () => {
    const out = summarizeSchedulerHealth([ranMinutesAgo(5), ranMinutesAgo(12)], NOW);
    expect(out.worstState).toBe('healthy');
    expect(out.needsAttention).toBe(false);
  });

  it('L. una fuente sana no tapa a una parada: manda la peor', () => {
    // ml_worker healthy no puede ocultar que nada se está disparando en otra fuente.
    const out = summarizeSchedulerHealth(
      [
        ranMinutesAgo(5, { sourceId: 'ml_worker' as HunterSourceId }),
        ranMinutesAgo(200, { sourceId: 'ml_api_legacy' as HunterSourceId }),
      ],
      NOW
    );
    expect(out.worstState).toBe('stale');
  });

  it('M. solo fuentes desactivadas no se reporta como avería', () => {
    const out = summarizeSchedulerHealth([row({ enabled: false })], NOW);
    expect(out.worstState).toBe('disabled');
    expect(out.needsAttention).toBe(false);
  });

  it('N. las tolerancias están ordenadas y son múltiplos, no minutos fijos', () => {
    expect(SCHEDULER_TOLERANCE.healthy).toBeLessThan(SCHEDULER_TOLERANCE.degraded);
    expect(SCHEDULER_TOLERANCE.degraded).toBeLessThan(SCHEDULER_TOLERANCE.stale);
  });

  it('O. es puro: la misma entrada da el mismo resultado', () => {
    const input = ranMinutesAgo(150);
    expect(classifySchedulerHealth(input, NOW)).toEqual(classifySchedulerHealth(input, NOW));
  });
});
