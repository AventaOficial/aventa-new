import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { clientHasScope, type MachineClientContext } from '@/lib/mcp/auth';
import { recordMachineCall } from '@/lib/mcp/audit';
import { checkOfferExists } from '@/lib/mcp/catalog';
import {
  MCP_CURRENCY,
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_NOTE_MAX,
  MCP_TITLE_MAX,
  MCP_TOOL_SCOPE,
  type McpErrorCode,
  type McpToolName,
} from '@/lib/mcp/contract';
import { buildSubmissionRules } from '@/lib/mcp/rules';
import {
  getSubmissionStatus,
  loadDailyUsage,
  quotaOf,
  submitDealCandidates,
  type McpOutcome,
} from '@/lib/mcp/submissions';

export const MCP_SERVER_NAME = 'aventa-candidates';
export const MCP_SERVER_VERSION = '1.0.0';

export type McpRequestContext = {
  supabase: SupabaseClient;
  client: MachineClientContext;
  requestId: string;
};

type AuditCounts = { accepted?: number; rejected?: number; duplicates?: number };

function okResult(data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

function errorResult(code: McpErrorCode, message: string): CallToolResult {
  const payload = { error: { code, message } };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload };
}

/**
 * Envuelve cada herramienta: scope, auditoría y errores sin detalle interno.
 */
async function runTool<T extends Record<string, unknown>>(
  ctx: McpRequestContext,
  tool: McpToolName,
  run: () => Promise<McpOutcome<T>>,
  counts?: (data: T) => AuditCounts,
): Promise<CallToolResult> {
  const started = Date.now();
  const audit = (resultStatus: string, c: AuditCounts = {}) =>
    recordMachineCall(ctx.supabase, {
      machineClientId: ctx.client.id,
      tool,
      requestId: ctx.requestId,
      resultStatus,
      acceptedCount: c.accepted,
      rejectedCount: c.rejected,
      duplicateCount: c.duplicates,
      latencyMs: Date.now() - started,
    });

  if (!clientHasScope(ctx.client, MCP_TOOL_SCOPE[tool])) {
    await audit('FORBIDDEN_SCOPE');
    return errorResult('FORBIDDEN_SCOPE', `Este cliente no tiene el scope ${MCP_TOOL_SCOPE[tool]}.`);
  }
  try {
    const outcome = await run();
    if (!outcome.ok) {
      await audit(outcome.code);
      return errorResult(outcome.code, outcome.message);
    }
    await audit(outcome.replay ? 'ok_replay' : 'ok', counts ? counts(outcome.data) : {});
    return okResult(outcome.data);
  } catch {
    console.error(`[mcp] tool ${tool} failed`);
    await audit('INTERNAL_ERROR');
    return errorResult('INTERNAL_ERROR', 'Error interno.');
  }
}

const candidateDocSchema = z
  .object({
    url: z.string().describe('URL https del producto en una tienda soportada (ver get_submission_rules).'),
    title: z.string().describe(`Título en texto plano, máximo ${MCP_TITLE_MAX} caracteres.`),
    price: z.number().describe('Precio observado en MXN, mayor que 0.'),
    originalPrice: z.number().optional().describe('Precio de lista en MXN, mayor que price.'),
    currency: z.literal(MCP_CURRENCY).describe('Siempre "MXN".'),
    note: z.string().optional().describe(`Nota en texto plano, máximo ${MCP_NOTE_MAX} caracteres.`),
    observedAt: z.string().describe('Momento de la observación, ISO 8601 con zona horaria.'),
  })
  .describe('Candidato. Es una pista: Aventa lo verifica y un humano decide.');

/** Un candidato inválido se rechaza por índice en el servidor; no tumba la llamada completa. */
const candidateItemSchema = z.union([candidateDocSchema, z.unknown()]);

/**
 * Servidor MCP por request, ligado al cliente autenticado.
 * Exactamente 4 herramientas. Ninguna escribe en `offers`, modera, publica ni toca economía.
 */
export function buildMcpServer(ctx: McpRequestContext): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'submit_deal_candidates',
    {
      title: 'Enviar candidatos de ofertas',
      description:
        `Propone hasta ${MCP_MAX_CANDIDATES_PER_CALL} candidatos de ofertas en México (MXN) para revisión humana. ` +
        'No publica nada. Reusar idempotencyKey con el mismo payload devuelve el envío original.',
      inputSchema: {
        idempotencyKey: z.string().describe('8-128 caracteres [A-Za-z0-9._:-], único por envío.'),
        runId: z.string().optional().describe('Identificador opcional de tu corrida, 1-128 caracteres.'),
        candidates: z
          .array(candidateItemSchema)
          .describe(`Lista de 1 a ${MCP_MAX_CANDIDATES_PER_CALL} candidatos.`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(
        ctx,
        'submit_deal_candidates',
        () => submitDealCandidates(ctx.supabase, ctx.client, args),
        (data) => ({
          accepted: data.accepted.length,
          rejected: data.rejected.length,
          duplicates: data.duplicatesInRequest.length,
        }),
      ),
  );

  server.registerTool(
    'get_submission_status',
    {
      title: 'Estado de un envío',
      description: 'Estado de cada candidato de un envío propio: received, processing, in_review, accepted, published, rejected, invalid o duplicate.',
      inputSchema: { submissionId: z.string().describe('submissionId devuelto por submit_deal_candidates.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(ctx, 'get_submission_status', () => getSubmissionStatus(ctx.supabase, ctx.client, args.submissionId)),
  );

  server.registerTool(
    'check_offer_exists',
    {
      title: 'Verificar si una oferta ya está publicada',
      description: 'Indica si el producto ya existe en el catálogo público de Aventa. Úsalo antes de enviar para no duplicar.',
      inputSchema: { url: z.string().describe('URL https del producto.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(ctx, 'check_offer_exists', () => checkOfferExists(ctx.supabase, args.url)),
  );

  server.registerTool(
    'get_submission_rules',
    {
      title: 'Reglas de envío',
      description: 'Moneda, límites, cuota diaria, tiendas soportadas, campos y herramientas disponibles.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      runTool(ctx, 'get_submission_rules', async () => {
        const used = await loadDailyUsage(ctx.supabase, ctx.client.id);
        return { ok: true, data: buildSubmissionRules(ctx.client, used == null ? null : quotaOf(ctx.client, used)) };
      }),
  );

  return server;
}
