/**
 * Human label metrics — 0 labels must be BLOCKED, never 0%.
 */

export type LabelAvailability = {
  labeled: number;
  coverage: number | null;
  status: 'OK' | 'BLOCKED' | 'INSUFFICIENT';
  precision: number | null;
  recall: number | null;
  fnRate: number | null;
  precisionDisplay: string;
  recallDisplay: string;
  fnRateDisplay: string;
  note: string;
};

export function computeLabelAvailability(input: {
  totalCandidates: number;
  labeled: number;
  truePositive?: number;
  falsePositive?: number;
  falseNegative?: number;
  minLabeled?: number;
}): LabelAvailability {
  const min = input.minLabeled ?? 5;
  const labeled = input.labeled;
  const total = input.totalCandidates;
  const coverage = total > 0 ? labeled / total : null;

  if (labeled === 0) {
    return {
      labeled: 0,
      coverage: coverage ?? 0,
      status: 'BLOCKED',
      precision: null,
      recall: null,
      fnRate: null,
      precisionDisplay: 'unavailable',
      recallDisplay: 'unavailable',
      fnRateDisplay: 'unavailable',
      note: 'LABEL COVERAGE N=0 — precision/recall/FN are BLOCKED, not 0%.',
    };
  }

  if (labeled < min) {
    return {
      labeled,
      coverage,
      status: 'INSUFFICIENT',
      precision: null,
      recall: null,
      fnRate: null,
      precisionDisplay: 'unavailable',
      recallDisplay: 'unavailable',
      fnRateDisplay: 'unavailable',
      note: `Only ${labeled} labels (< ${min}) — metrics unavailable.`,
    };
  }

  const tp = input.truePositive ?? 0;
  const fp = input.falsePositive ?? 0;
  const fn = input.falseNegative ?? 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const fnRate = fp + fn > 0 ? fn / (fp + fn) : null;

  const fmt = (v: number | null) =>
    v == null ? 'unavailable' : `${Math.round(v * 1000) / 10}%`;

  return {
    labeled,
    coverage,
    status: 'OK',
    precision,
    recall,
    fnRate,
    precisionDisplay: fmt(precision),
    recallDisplay: fmt(recall),
    fnRateDisplay: fmt(fnRate),
    note: 'Ground-truth metrics from human labels only.',
  };
}
