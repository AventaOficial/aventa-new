/**
 * Explicable score signals from existing ScoreBreakdown.
 * Deterministic mapping — no invented features.
 */

import type { ScoreBreakdown } from '@/lib/bots/ingest/scoreIngestCandidate';
import { SCORING_VERSION } from './versions';

export type ScoreSignal = {
  signal: string;
  points: number;
  note: string;
};

export type ScoreExplanation = {
  total: number;
  scoringVersion: string;
  signals: ScoreSignal[];
  summary: string;
};

export function explainScoreBreakdown(
  breakdown: ScoreBreakdown | null | undefined,
  total?: number | null,
): ScoreExplanation {
  const b = breakdown ?? {
    discount: 0,
    popularity: 0,
    rating: 0,
    category: 0,
    priceAppeal: 0,
    historical: 0,
    total: 0,
  };
  const scoreTotal = typeof total === 'number' && Number.isFinite(total) ? total : b.total;
  const signals: ScoreSignal[] = [
    {
      signal: 'price_drop',
      points: round1(b.discount),
      note: 'Descuento efectivo vs precio original declarado',
    },
    {
      signal: 'historical_price_confidence',
      points: round1(b.historical),
      note: 'Ahorro vs precio habitual / lowest 90d (si hay intel)',
    },
    {
      signal: 'popularity',
      points: round1(b.popularity),
      note: 'Señales de ventas / listing type',
    },
    {
      signal: 'product_rating',
      points: round1(b.rating),
      note: 'Rating y volumen de reseñas',
    },
    {
      signal: 'category_fit',
      points: round1(b.category),
      note: 'Afinidad a categorías tech/prioritarias del config',
    },
    {
      signal: 'price_appeal',
      points: round1(b.priceAppeal),
      note: 'Atractivo del rango de precio MXN',
    },
  ];
  const top = [...signals].sort((a, b) => b.points - a.points).slice(0, 3);
  const summary =
    top.length === 0
      ? `score=${scoreTotal} (sin breakdown)`
      : `score=${scoreTotal}; top: ${top.map((s) => `${s.signal}=${s.points}`).join(', ')}`;

  return {
    total: scoreTotal,
    scoringVersion: SCORING_VERSION,
    signals,
    summary,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
