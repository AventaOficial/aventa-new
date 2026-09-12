/**
 * Errores de escritura de calibración. Memoria de isolate.
 * No es persistencia. No cambia decisiones.
 */
export type CalibrationWriteKind = 'shadow' | 'human';

export type CalibrationWriteMetrics = {
  shadowWrites: number;
  shadowFailures: number;
  humanWrites: number;
  humanFailures: number;
  lastShadowError: string | null;
  lastHumanError: string | null;
  lastShadowAt: string | null;
  lastHumanAt: string | null;
};

const metrics: CalibrationWriteMetrics = {
  shadowWrites: 0,
  shadowFailures: 0,
  humanWrites: 0,
  humanFailures: 0,
  lastShadowError: null,
  lastHumanError: null,
  lastShadowAt: null,
  lastHumanAt: null,
};

export function recordCalibrationWrite(
  kind: CalibrationWriteKind,
  ok: boolean,
  reason?: string | null,
  now: Date = new Date(),
): void {
  const at = now.toISOString();
  if (kind === 'shadow') {
    metrics.shadowWrites += 1;
    metrics.lastShadowAt = at;
    if (!ok) {
      metrics.shadowFailures += 1;
      metrics.lastShadowError = (reason ?? 'error').slice(0, 64);
    }
    return;
  }
  metrics.humanWrites += 1;
  metrics.lastHumanAt = at;
  if (!ok) {
    metrics.humanFailures += 1;
    metrics.lastHumanError = (reason ?? 'error').slice(0, 64);
  }
}

export function getCalibrationWriteMetrics(): CalibrationWriteMetrics {
  return { ...metrics };
}

export function resetCalibrationWriteMetrics(): void {
  metrics.shadowWrites = 0;
  metrics.shadowFailures = 0;
  metrics.humanWrites = 0;
  metrics.humanFailures = 0;
  metrics.lastShadowError = null;
  metrics.lastHumanError = null;
  metrics.lastShadowAt = null;
  metrics.lastHumanAt = null;
}
