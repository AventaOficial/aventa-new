import { DESPENSA_OFFICIAL_REFERENCES } from '@/lib/despensa/catalog';
import {
  assessSaving,
  dedupeObservations,
  normalizeObservation,
  type DespensaPriceObservation,
  type ObservationRejection,
  type RawObservationInput,
} from '@/lib/despensa/observation';
import { validateCandidates } from '@/lib/mcp/candidates';
import {
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_NOTE_MAX,
  type CandidateRejectionCode,
  type SubmissionCandidateState,
} from '@/lib/mcp/contract';

/**
 * Preparación de un lote de Grok Bots para `submit_deal_candidates`.
 *
 * El bot nunca escribe en la base: este módulo solo produce payloads para la herramienta MCP
 * real, que deja todo `pending` para moderación humana. Las validaciones de servidor se
 * reutilizan tal cual (`validateCandidates`), así lo que se rechaza aquí también se rechazaría allá.
 */
export const GROK_BATCH_RULES = {
  version: 'despensa-grok-batch-v1',
  /** Objetivo de exploración por bot o lote. No es una cuota a llenar. */
  explorationTarget: 250,
  /** Tamaño del primer envío real en un entorno nuevo. */
  firstLiveBatchMax: 5,
} as const;

export type McpCandidatePayload = {
  url: string;
  title: string;
  price: number;
  currency: 'MXN';
  observedAt: string;
  originalPrice?: number;
  note: string;
};

export type McpSubmission = {
  idempotencyKey: string;
  runId: string;
  candidates: McpCandidatePayload[];
};

function noteValue(v: string): string {
  return v.replace(/[<>&;|=\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Evidencia compacta en texto plano. Es una pista para moderación, no un dato verificado. */
export function observationNote(o: DespensaPriceObservation): string {
  const parts = [
    `despensa ${o.catalogVersion}`,
    o.needId ? `need ${o.needId}${o.variantId ? `/${o.variantId}` : ''}` : 'need none',
    o.brand ? `brand ${noteValue(o.brand)}` : null,
    o.presentation ? `net ${o.presentation.totalBase}${o.presentation.dimension === 'mass' ? 'g' : o.presentation.dimension === 'volume' ? 'ml' : ` ${o.presentation.countUnit ?? 'pieza'}`}` : 'net unknown',
    o.unitPrice ? `unit ${o.unitPrice.value}/${o.unitPrice.per}` : null,
    `region ${o.region.scope}${o.region.label ? ` ${noteValue(o.region.label)}` : ''}`,
    `avail ${o.availability}`,
    o.evidence.listPrice != null ? 'list price shown by store' : null,
    `agent ${noteValue(o.agent.id)}`,
    `conf ${o.confidence}`,
  ].filter(Boolean);
  const note = parts.join('; ');
  return Array.from(note).slice(0, MCP_NOTE_MAX).join('');
}

export function toMcpCandidate(o: DespensaPriceObservation): McpCandidatePayload {
  return {
    url: o.canonicalUrl,
    title: Array.from(o.title).slice(0, 200).join(''),
    price: o.price,
    currency: 'MXN',
    observedAt: o.observedAt,
    ...(o.evidence.listPrice != null ? { originalPrice: o.evidence.listPrice } : {}),
    note: observationNote(o),
  };
}

export type GrokBatchReport = {
  rulesVersion: string;
  runId: string;
  received: number;
  normalized: number;
  rejectedLocally: { index: number; reasons: ObservationRejection[] }[];
  duplicates: number;
  rejectedByMcpRules: { url: string; code: CandidateRejectionCode }[];
  ready: number;
  submissions: McpSubmission[];
  metrics: GrokBatchMetrics;
};

export type GrokBatchMetrics = {
  validRate: number | null;
  duplicateRate: number | null;
  withUnitPrice: number;
  /** Precio de lista mostrado por la tienda. No es descuento verificado. */
  withStoreListPrice: number;
  /** Bajadas respaldadas por historial propio longitudinal. */
  verifiedDrops: number;
  /** Historial previo de la misma presentaci?n con el que se compar? cada candidato. */
  priorHistory: Record<'none' | 'single_observation' | 'insufficient' | 'longitudinal', number>;
  officialCoverage: { covered: number; total: number; missing: string[] };
  stores: string[];
  sources: string[];
  regions: string[];
  needs: number;
  newestObservationAgeHours: number | null;
  oldestObservationAgeHours: number | null;
};

function officialKey(needId: string, variantId: string | null): string {
  return `${needId}/${variantId ?? '*'}`;
}

function officialCoverage(observations: readonly DespensaPriceObservation[]) {
  const items = DESPENSA_OFFICIAL_REFERENCES.flatMap((r) => r.items);
  const seen = new Set(observations.flatMap((o) => (o.needId ? [officialKey(o.needId, o.variantId), officialKey(o.needId, null)] : [])));
  const missing = items.filter((i) => !seen.has(officialKey(i.needId, i.variantId))).map((i) => i.label);
  return { covered: items.length - missing.length, total: items.length, missing };
}

/**
 * Prepara el lote: normaliza, rechaza lo inverificable, deduplica conservando procedencia,
 * aplica las reglas del servidor MCP y parte en envíos de hasta 20 candidatos.
 */
export function prepareGrokBatch(
  records: readonly RawObservationInput[],
  opts: { now: Date; runId: string; priorObservations?: readonly DespensaPriceObservation[] },
): GrokBatchReport {
  const rejectedLocally: GrokBatchReport['rejectedLocally'] = [];
  const valid: DespensaPriceObservation[] = [];
  records.forEach((raw, index) => {
    const result = normalizeObservation(raw, opts.now);
    if (result.ok) valid.push(result.observation);
    else rejectedLocally.push({ index, reasons: result.reasons });
  });

  const { groups, duplicates } = dedupeObservations(valid);
  const unique = groups.map((g) => g.observation);
  const payloads = unique.map(toMcpCandidate);
  const mcp = validateCandidates(payloads, opts.now);
  const rejectedByMcpRules = [
    ...mcp.rejected.map((r) => ({ url: payloads[r.index].url, code: r.code })),
    ...mcp.duplicatesInRequest.map((d) => ({ url: payloads[d.index].url, code: 'DUPLICATE_IN_REQUEST' as const })),
  ];
  const acceptedIdx = new Set(mcp.valid.map((v) => v.index));
  const ready = payloads.filter((_, i) => acceptedIdx.has(i));
  const readyObs = unique.filter((_, i) => acceptedIdx.has(i));

  const submissions: McpSubmission[] = [];
  for (let i = 0; i < ready.length; i += MCP_MAX_CANDIDATES_PER_CALL) {
    const n = submissions.length + 1;
    submissions.push({
      idempotencyKey: `${opts.runId}:${String(n).padStart(3, '0')}`,
      runId: opts.runId,
      candidates: ready.slice(i, i + MCP_MAX_CANDIDATES_PER_CALL),
    });
  }

  const prior = opts.priorObservations ?? [];
  const history = { none: 0, single_observation: 0, insufficient: 0, longitudinal: 0 };
  let verifiedDrops = 0;
  for (const o of readyObs) {
    const saving = assessSaving(o, prior);
    history[saving.history] += 1;
    if (saving.claim === 'verified_drop') verifiedDrops += 1;
  }
  const ages = readyObs.map((o) => (opts.now.getTime() - Date.parse(o.observedAt)) / 3_600_000);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    rulesVersion: GROK_BATCH_RULES.version,
    runId: opts.runId,
    received: records.length,
    normalized: valid.length,
    rejectedLocally,
    duplicates,
    rejectedByMcpRules,
    ready: ready.length,
    submissions,
    metrics: {
      validRate: records.length ? round1((ready.length / records.length) * 100) : null,
      duplicateRate: valid.length ? round1((duplicates / valid.length) * 100) : null,
      withUnitPrice: readyObs.filter((o) => o.unitPrice).length,
      withStoreListPrice: readyObs.filter((o) => o.evidence.listPrice != null).length,
      verifiedDrops,
      priorHistory: history,
      officialCoverage: officialCoverage(readyObs),
      stores: [...new Set(readyObs.map((o) => o.storeHost))].sort(),
      sources: [...new Set(readyObs.flatMap((o) => (o.sourceId ? [o.sourceId] : [])))].sort(),
      regions: [...new Set(readyObs.map((o) => `${o.region.scope}${o.region.label ? `:${o.region.label}` : ''}`))].sort(),
      needs: new Set(readyObs.flatMap((o) => (o.needId ? [o.needId] : []))).size,
      newestObservationAgeHours: ages.length ? round1(Math.min(...ages)) : null,
      oldestObservationAgeHours: ages.length ? round1(Math.max(...ages)) : null,
    },
  };
}

/** Resumen de `get_submission_status`: aprobación y publicación reales, no estimadas. */
/** Cantidad del envío real: entero de 1 a `firstLiveBatchMax`. Cualquier otro valor es null. */
export function resolveLiveBatchLimit(raw: unknown): number | null {
  if (raw === undefined || raw === true) return GROK_BATCH_RULES.firstLiveBatchMax;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= GROK_BATCH_RULES.firstLiveBatchMax ? n : null;
}

/** Motivo para no enviar un archivo por MCP, o null si puede enviarse. */
export function liveSubmitBlocker(input: { path: string; fixture?: unknown; simulatedNow?: unknown }): string | null {
  if (input.fixture !== undefined && input.fixture !== false) return 'fixture';
  if (/(^|[\\/])(tests?|fixtures?|__fixtures__)([\\/]|$)/i.test(input.path)) return 'fixture_path';
  if (input.simulatedNow !== undefined) return 'simulated_now';
  return null;
}

export function summarizeSubmissionStatus(candidates: readonly { state: SubmissionCandidateState }[]) {
  const counts: Record<SubmissionCandidateState, number> = {
    received: 0,
    processing: 0,
    in_review: 0,
    accepted: 0,
    published: 0,
    rejected: 0,
    invalid: 0,
    duplicate: 0,
  };
  for (const c of candidates) counts[c.state] += 1;
  const decided = counts.accepted + counts.published + counts.rejected;
  return {
    counts,
    approvalRate: decided ? Math.round(((counts.accepted + counts.published) / decided) * 1000) / 10 : null,
    publicationRate: candidates.length ? Math.round((counts.published / candidates.length) * 1000) / 10 : null,
    pendingHumanReview: counts.received + counts.processing + counts.in_review,
  };
}
