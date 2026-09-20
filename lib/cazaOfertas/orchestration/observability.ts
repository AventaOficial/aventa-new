/**
 * CazaOfertasss — FASE 4. Observabilidad del ciclo.
 *
 * Sólo conteos, reason codes y mensajes redactados. Jamás tokens, tags de
 * afiliado, service_role, JWT ni URLs con query string.
 */

import { MAX_CYCLE_ERRORS, MAX_STAGE_REASON_CODES } from '../constants';
import type { CazaClock, CazaCycleError, CazaPipelineStage, CazaStageReport } from './types';

const REASON_CODE_MAX_LENGTH = 120;
const ERROR_MESSAGE_MAX_LENGTH = 300;

/** Redacta patrones sensibles de un mensaje libre antes de que entre al reporte. */
export function redactForObservability(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : String(raw);
  return (
    text
      // Telegram bot token: 123456789:AA...
      .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[redacted_token]')
      // JWT (service_role / anon keys)
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted_jwt]')
      // Query strings completas en URLs (pueden llevar tag=, matt_word=, tokens)
      .replace(/(https?:\/\/[^\s?#'"]+)\?[^\s'"]*/gi, '$1?[redacted_query]')
      // Pares clave=valor sensibles fuera de URL
      .replace(
        /\b(tag|matt_word|matt_tool|token|api_key|apikey|secret|service_role|authorization|bearer)\s*[=:]\s*[^\s&,;'"]+/gi,
        '$1=[redacted]'
      )
      .replace(/service_role/gi, '[redacted]')
      .slice(0, ERROR_MESSAGE_MAX_LENGTH)
  );
}

function normalizeReasonCode(reason: string): string {
  return redactForObservability(reason).slice(0, REASON_CODE_MAX_LENGTH);
}

/**
 * Acumulador por stage. `finish()` produce el reporte inmutable.
 */
export interface StageRecorder {
  readonly stage: CazaPipelineStage;
  input(n?: number): void;
  success(n?: number): void;
  rejected(reasons?: readonly string[]): void;
  failed(reasons?: readonly string[]): void;
  skipped(reasons?: readonly string[]): void;
  reason(code: string): void;
  finish(): CazaStageReport;
}

export function createStageRecorder(
  cycleId: string,
  stage: CazaPipelineStage,
  clock: CazaClock
): StageRecorder {
  const startedMs = clock().getTime();
  let inputCount = 0;
  let successCount = 0;
  let rejectedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const reasonCodes = new Map<string, number>();
  let overflow = 0;

  function addReasons(reasons: readonly string[] | undefined) {
    if (!reasons) return;
    for (const r of reasons) {
      const code = normalizeReasonCode(r);
      const current = reasonCodes.get(code);
      if (current !== undefined) {
        reasonCodes.set(code, current + 1);
      } else if (reasonCodes.size < MAX_STAGE_REASON_CODES) {
        reasonCodes.set(code, 1);
      } else {
        overflow += 1;
      }
    }
  }

  return {
    stage,
    input(n = 1) {
      inputCount += n;
    },
    success(n = 1) {
      successCount += n;
    },
    rejected(reasons) {
      rejectedCount += 1;
      addReasons(reasons);
    },
    failed(reasons) {
      failedCount += 1;
      addReasons(reasons);
    },
    skipped(reasons) {
      skippedCount += 1;
      addReasons(reasons);
    },
    reason(code) {
      addReasons([code]);
    },
    finish() {
      const codes: Record<string, number> = {};
      for (const [k, v] of [...reasonCodes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        codes[k] = v;
      }
      if (overflow > 0) codes['observability.reason_codes_truncated'] = overflow;
      return {
        cycleId,
        stage,
        durationMs: Math.max(0, clock().getTime() - startedMs),
        inputCount,
        successCount,
        rejectedCount,
        failedCount,
        skippedCount,
        reasonCodes: codes,
      };
    },
  };
}

/** Lista de errores acotada; nunca crece sin límite. */
export interface CycleErrorSink {
  push(error: CazaCycleError): void;
  all(): readonly CazaCycleError[];
  size(): number;
}

export function createCycleErrorSink(): CycleErrorSink {
  const errors: CazaCycleError[] = [];
  let dropped = 0;
  return {
    push(error) {
      if (errors.length >= MAX_CYCLE_ERRORS) {
        dropped += 1;
        return;
      }
      errors.push({
        ...error,
        message: redactForObservability(error.message),
        code: normalizeReasonCode(error.code),
      });
    },
    all() {
      if (dropped === 0) return errors;
      return [
        ...errors,
        {
          stage: 'CYCLE',
          code: 'observability.errors_truncated',
          message: `${dropped} errors dropped`,
          sourceId: null,
          identityKey: null,
        },
      ];
    },
    size() {
      return errors.length + dropped;
    },
  };
}
