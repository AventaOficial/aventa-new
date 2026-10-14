/**
 * Lote de Grok Bots para Despensa.
 *
 *   npx tsx scripts/despensa-grok-batch.ts --input lote.json [--run-id grok-20261012-a] [--out reporte.json]
 *   npx tsx scripts/despensa-grok-batch.ts --input lote.json --submit [--max 1-5]
 *   npx tsx scripts/despensa-grok-batch.ts --status <submissionId>
 *
 * Por defecto es una simulación: normaliza, deduplica, valida con las reglas del servidor MCP
 * e imprime el reporte. No hace red ni escribe nada.
 *
 * `--submit` usa solo las herramientas MCP reales (`get_submission_rules`, `check_offer_exists`,
 * `submit_deal_candidates`, `get_submission_status`) con el token del cliente máquina
 * autorizado en `AVENTA_MCP_TOKEN` contra `AVENTA_MCP_URL`. Envía como máximo `--max`
 * candidatos (de 1 a 5; 5 por defecto). Se niega si el archivo es un fixture o vive en una
 * carpeta de pruebas, si se fijó `--now`, o si
 * `get_submission_rules` reporta la ingesta apagada. Nunca imprime el token.
 *
 * Entrada: `{ "records": RawObservationInput[] }` (ver `lib/despensa/observation.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  GROK_BATCH_RULES,
  liveSubmitBlocker,
  prepareGrokBatch,
  resolveLiveBatchLimit,
  summarizeSubmissionStatus,
} from '@/lib/despensa/grokBatch';
import type { RawObservationInput } from '@/lib/despensa/observation';
import type { SubmissionCandidateState } from '@/lib/mcp/contract';

type Args = Record<string, string | true>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

function fail(message: string, code = 1): never {
  console.error(`[despensa-grok] ${message}`);
  process.exit(code);
}

let rpcId = 0;
async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.AVENTA_MCP_URL?.trim();
  const token = process.env.AVENTA_MCP_TOKEN?.trim();
  if (!url || !token) fail('Faltan AVENTA_MCP_URL o AVENTA_MCP_TOKEN.');
  if (!url.startsWith('https://')) fail('AVENTA_MCP_URL debe ser https.');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }),
  });
  if (res.status === 401) fail('MCP respondió 401: token inválido, revocado o vencido.');
  if (res.status === 429) fail('MCP respondió 429: límite por minuto. Espera y reintenta con la misma llave.');
  if (res.status === 503) fail('MCP respondió 503: backend distribuido o entorno no verificado. No hay bypass.');
  if (!res.ok) fail(`MCP respondió HTTP ${res.status}.`);
  const body = (await res.json()) as { result?: { structuredContent?: Record<string, unknown>; isError?: boolean }; error?: { message?: string } };
  if (body.error) fail(`Error JSON-RPC: ${body.error.message ?? 'desconocido'}`);
  const data = body.result?.structuredContent ?? {};
  if (body.result?.isError) {
    const err = (data.error ?? {}) as { code?: string; message?: string };
    throw new Error(`${name}: ${err.code ?? 'ERROR'} ${err.message ?? ''}`.trim());
  }
  return data;
}

async function printStatus(submissionId: string) {
  const status = await callTool('get_submission_status', { submissionId });
  const candidates = (status.candidates ?? []) as { state: SubmissionCandidateState }[];
  console.log(JSON.stringify({ submissionId, summary: summarizeSubmissionStatus(candidates), candidates }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.status === 'string') return printStatus(args.status);
  if (typeof args.input !== 'string') fail('Uso: --input <archivo.json> [--submit] | --status <submissionId>');

  const file = JSON.parse(readFileSync(args.input, 'utf8')) as { fixture?: boolean; records?: RawObservationInput[] };
  if (!Array.isArray(file.records)) fail('El archivo debe tener { "records": [...] }.');
  const now = typeof args.now === 'string' ? new Date(args.now) : new Date();
  if (!Number.isFinite(now.getTime())) fail('--now inválido.');
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const runId = typeof args['run-id'] === 'string' ? args['run-id'] : `grok-despensa-${stamp}`;

  const report = prepareGrokBatch(file.records, { now, runId });
  const summary = {
    runId,
    rulesVersion: report.rulesVersion,
    explorationTarget: GROK_BATCH_RULES.explorationTarget,
    received: report.received,
    normalized: report.normalized,
    rejectedLocally: report.rejectedLocally.length,
    duplicates: report.duplicates,
    rejectedByMcpRules: report.rejectedByMcpRules.length,
    ready: report.ready,
    submissions: report.submissions.length,
    metrics: report.metrics,
  };
  if (typeof args.out === 'string') writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  if (args.submit !== true) {
    console.log('[despensa-grok] Simulación: no se envió nada. Usa --submit para un lote pequeño real.');
    return;
  }
  const blocker = liveSubmitBlocker({ path: args.input, fixture: file.fixture, simulatedNow: args.now });
  if (blocker === 'fixture' || blocker === 'fixture_path') fail('El archivo es un fixture o vive en una carpeta de pruebas: no se envía por MCP.', 2);
  if (blocker === 'simulated_now') fail('--now solo sirve para simular; un envío real usa la hora actual.', 2);

  const max = resolveLiveBatchLimit(args.max);
  if (max === null) fail(`--max debe ser un entero de 1 a ${GROK_BATCH_RULES.firstLiveBatchMax}.`, 2);
  const rules = await callTool('get_submission_rules', {});
  if (rules.ingestEnabled !== true) fail('get_submission_rules: ingestEnabled=false (INGEST_PAUSED o cliente pausado). No se envía.', 3);

  const candidates = [];
  for (const c of report.submissions.flatMap((s) => s.candidates)) {
    if (candidates.length >= max) break;
    const check = await callTool('check_offer_exists', { url: c.url });
    if (check.exists === true || check.canSubmit === false) continue;
    candidates.push(c);
  }
  if (candidates.length === 0) fail('No quedan candidatos nuevos para enviar.', 0);

  const submission = await callTool('submit_deal_candidates', {
    idempotencyKey: `${runId}:live:001`,
    runId,
    candidates,
  });
  console.log(JSON.stringify({ submitted: candidates.length, response: submission }, null, 2));
  if (typeof submission.submissionId === 'string') await printStatus(submission.submissionId);
}

main().catch((err) => fail(err instanceof Error ? err.message : 'error'));
