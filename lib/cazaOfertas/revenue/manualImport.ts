/**
 * CazaOfertasss — FASE 3.2. Manual import readiness.
 *
 * Abstracción para introducir posteriormente CSV / XLSX / JSON / API
 * SIN modificar el ledger. Ningún parser específico aquí.
 */

import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import type { AffiliateRevenueProviderId, OpaqueProviderPayload } from './types';
import type { RawProviderRevenueRecord } from './providerReport';

/** Formatos que un importador futuro podrá declarar. Sin parsers aún. */
export type ManualImportFormat = 'csv' | 'xlsx' | 'json' | 'api';

export interface ManualImportEnvelope {
  readonly batchId: string;
  readonly provider: AffiliateRevenueProviderId;
  readonly format: ManualImportFormat;
  readonly receivedAt: string;
  /** Payload opaco — el parser futuro lo interpreta; el core no. */
  readonly opaque: OpaqueProviderPayload;
  readonly sourceLabel: string;
}

export interface ManualImportProjection {
  readonly envelope: ManualImportEnvelope;
  /**
   * Records ya proyectados a contrato neutral.
   * Vacío hasta que exista un parser oficial registrado.
   */
  readonly records: readonly RawProviderRevenueRecord[];
}

/**
 * Port: adquiere un envelope y (eventualmente) proyecta a RawProviderRevenueRecord[].
 * FASE 3.2: sólo readiness — project() falla closed sin parser registrado.
 */
export interface ManualImportSourcePort {
  readonly format: ManualImportFormat;
  project(envelope: ManualImportEnvelope): Promise<CazaResult<ManualImportProjection>>;
}

const REGISTERED_PARSERS = new Set<ManualImportFormat>();

/** Test/harness: registra que un formato tiene parser (sin implementar el parser). */
export function acknowledgeManualImportFormatSupport(format: ManualImportFormat): void {
  REGISTERED_PARSERS.add(format);
}

export function resetManualImportFormatSupportForTests(): void {
  REGISTERED_PARSERS.clear();
}

export function isManualImportFormatAcknowledged(format: ManualImportFormat): boolean {
  return REGISTERED_PARSERS.has(format);
}

/**
 * Fuente manual fail-closed: acepta el envelope pero no parsea.
 * Cuando un parser oficial exista, se registrará fuera de este módulo.
 */
export function createManualImportReadinessSource(
  format: ManualImportFormat
): ManualImportSourcePort {
  return {
    format,
    async project(envelope) {
      if (envelope.format !== format) {
        return failResult([
          `manual_import.format_mismatch:${envelope.format}!=${format}`,
        ]);
      }
      if (!REGISTERED_PARSERS.has(format)) {
        return failResult([
          `manual_import.parser_not_registered:${format}`,
          'manual_import.official_schema_required',
        ]);
      }
      // Parser registrado pero aún no implementado en dominio → vacío explícito.
      return okResult({
        envelope,
        records: [],
      });
    },
  };
}

export function buildManualImportEnvelope(
  input: Omit<ManualImportEnvelope, 'opaque'> & {
    readonly opaqueBody: string;
    readonly contentType?: OpaqueProviderPayload['contentType'];
  }
): ManualImportEnvelope {
  return {
    batchId: input.batchId,
    provider: input.provider,
    format: input.format,
    receivedAt: input.receivedAt,
    sourceLabel: input.sourceLabel,
    opaque: {
      contentType: input.contentType ?? 'future_official_export',
      body: input.opaqueBody,
    },
  };
}
