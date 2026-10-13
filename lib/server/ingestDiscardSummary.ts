/**
 * Resumen de descartes de ingesta para la alerta de integridad.
 * Un duplicado no es descarte: el producto ya está en Aventa.
 */

const DISCARD_STATUSES = new Set(['REJECTED', 'NEEDS_REVIEW', 'ERROR']);
const NOT_A_DISCARD = new Set(['DUPLICATE_OFFER']);

export const INGEST_DISCARD_MIN_SAMPLE = 20;
export const INGEST_DISCARD_MAX_RATIO = 0.5;

export type IngestDiscardSummary = {
  total: number;
  discarded: number;
  ratio: number;
  byCode: Array<{ code: string; count: number }>;
  violated: boolean;
};

export function summarizeIngestDiscards(
  rows: Array<{ status: string | null; error_code: string | null }>,
): IngestDiscardSummary {
  const counts = new Map<string, number>();
  let total = 0;
  let discarded = 0;
  for (const row of rows) {
    if (NOT_A_DISCARD.has(row.error_code ?? '')) continue;
    total += 1;
    if (!DISCARD_STATUSES.has(row.status ?? '')) continue;
    discarded += 1;
    const code = row.error_code || row.status || 'UNKNOWN';
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const ratio = total > 0 ? discarded / total : 0;
  return {
    total,
    discarded,
    ratio,
    byCode: [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    violated: total >= INGEST_DISCARD_MIN_SAMPLE && ratio > INGEST_DISCARD_MAX_RATIO,
  };
}

export function formatIngestDiscardDetail(summary: IngestDiscardSummary): string {
  const top = summary.byCode.slice(0, 5).map((c) => `${c.code}=${c.count}`).join(', ');
  return `24h items=${summary.total} discarded=${summary.discarded} (${Math.round(summary.ratio * 100)}%)${top ? ` top: ${top}` : ''}`;
}

export type SourceHealthRow = {
  source_id: string;
  status: string | null;
  breaker_state: string | null;
  last_error_code: string | null;
};

export function unhealthySources(rows: SourceHealthRow[]): SourceHealthRow[] {
  return rows.filter((r) => r.status === 'down' || r.breaker_state === 'open');
}
