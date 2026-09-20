/**
 * CazaOfertasss — FASE 3.3. Funnel derivado (analytics, no money authority).
 *
 * Nunca dividir con denominator 0/null.
 * Nunca convertir UNKNOWN en 0.
 */

import type { IsoTimestamp } from '../types';

export type FunnelStageId =
  | 'discovered'
  | 'validated'
  | 'publishable'
  | 'prepared'
  | 'published'
  | 'clicked'
  | 'attributed'
  | 'converted'
  | 'approved'
  | 'commission';

export interface FunnelStageCount {
  readonly stage: FunnelStageId;
  /** null = desconocido (sin evidencia en la ventana). */
  readonly count: number | null;
}

export interface FunnelRate {
  readonly from: FunnelStageId;
  readonly to: FunnelStageId;
  /** null si falta numerador/denominador o denominador 0. */
  readonly rate: number | null;
}

export interface FunnelWindow {
  readonly fromInclusive: IsoTimestamp;
  readonly toExclusive: IsoTimestamp;
}

export interface CazaFunnelSnapshot {
  readonly window: FunnelWindow;
  readonly stages: readonly FunnelStageCount[];
  readonly rates: readonly FunnelRate[];
  readonly computedAt: IsoTimestamp;
}

export interface FunnelCountsInput {
  readonly discovered: number | null;
  readonly validated: number | null;
  readonly publishable: number | null;
  readonly prepared: number | null;
  readonly published: number | null;
  readonly clicked: number | null;
  readonly attributed: number | null;
  readonly converted: number | null;
  readonly approved: number | null;
  readonly commission: number | null;
}

const STAGE_ORDER: readonly FunnelStageId[] = [
  'discovered',
  'validated',
  'publishable',
  'prepared',
  'published',
  'clicked',
  'attributed',
  'converted',
  'approved',
  'commission',
] as const;

/**
 * rate = to/from cuando ambos son números y from > 0.
 * Si cualquiera es null o from === 0 ⇒ null (no 0 inventado).
 */
export function safeRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

export function buildFunnelSnapshot(input: {
  readonly window: FunnelWindow;
  readonly counts: FunnelCountsInput;
  readonly computedAt: IsoTimestamp;
}): CazaFunnelSnapshot {
  const c = input.counts;
  const byStage: Record<FunnelStageId, number | null> = {
    discovered: c.discovered,
    validated: c.validated,
    publishable: c.publishable,
    prepared: c.prepared,
    published: c.published,
    clicked: c.clicked,
    attributed: c.attributed,
    converted: c.converted,
    approved: c.approved,
    commission: c.commission,
  };

  const stages: FunnelStageCount[] = STAGE_ORDER.map((stage) => ({
    stage,
    count: byStage[stage],
  }));

  const pairs: Array<[FunnelStageId, FunnelStageId]> = [
    ['discovered', 'validated'],
    ['validated', 'publishable'],
    ['publishable', 'prepared'],
    ['prepared', 'published'],
    ['published', 'clicked'],
    ['clicked', 'attributed'],
    ['attributed', 'converted'],
    ['converted', 'approved'],
    ['approved', 'commission'],
  ];

  const rates: FunnelRate[] = pairs.map(([from, to]) => ({
    from,
    to,
    rate: safeRate(byStage[to], byStage[from]),
  }));

  return {
    window: input.window,
    stages,
    rates,
    computedAt: input.computedAt,
  };
}
