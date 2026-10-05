import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateMachineClient } from '@/lib/mcp/auth';
import { newMcpRequestId } from '@/lib/mcp/audit';
import { MCP_MAX_BODY_BYTES } from '@/lib/mcp/contract';
import { buildMcpServer } from '@/lib/mcp/server';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Endpoint MCP (Streamable HTTP, sin sesión) para proveedores de candidatos.
 * Contrato: docs/SYSTEMS/MCP_GROK_BOTS.md
 *
 * Orden: autenticación -> tamaño -> JSON -> rate limit (tools/call) -> herramientas.
 * Nunca anónimo. Nunca acepta el secreto de cron. Nunca registra el token ni la cabecera Authorization.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
  data?: { code: string },
): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code, message, ...(data ? { data } : {}) }, id: null }), {
    status,
    headers: { 'Content-Type': 'application/json', ...NO_STORE, ...headers },
  });
}

function unauthorized(): Response {
  return jsonRpcError(401, -32001, 'Unauthorized', {
    'WWW-Authenticate': 'Bearer realm="aventa-mcp", error="invalid_token"',
  });
}

/** Lee el cuerpo con tope de bytes aunque no haya Content-Length. */
async function readBodyCapped(request: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false }> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  if (!request.body) return { ok: true, text: '' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(merged) };
}

function isToolCall(message: unknown): boolean {
  return Boolean(message && typeof message === 'object' && (message as { method?: unknown }).method === 'tools/call');
}

export async function POST(request: Request): Promise<Response> {
  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return jsonRpcError(503, -32603, 'Service unavailable');
  }

  const auth = await authenticateMachineClient(supabase, request.headers.get('authorization'));
  if (!auth.ok) {
    if (auth.reason === 'lookup_failed') return jsonRpcError(503, -32603, 'Service unavailable');
    return unauthorized();
  }

  const body = await readBodyCapped(request, MCP_MAX_BODY_BYTES);
  if (!body.ok) return jsonRpcError(413, -32600, 'Payload too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return jsonRpcError(400, -32700, 'Parse error');
  }
  if (Array.isArray(parsed)) return jsonRpcError(400, -32600, 'Batch requests are not supported');
  if (!parsed || typeof parsed !== 'object') return jsonRpcError(400, -32600, 'Invalid request');

  if (isToolCall(parsed)) {
    const rl = await enforceRateLimitCustom(`mcp:${auth.client.id}`, 'mcp');
    if (!rl.success) {
      if (rl.status === 503) return jsonRpcError(503, -32603, 'Rate limit backend unavailable');
      return jsonRpcError(429, -32029, 'Rate limit exceeded', { 'Retry-After': '60' }, { code: 'RATE_LIMITED' });
    }
  }

  const server = buildMcpServer({ supabase, client: auth.client, requestId: newMcpRequestId() });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: parsed });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    console.error('[mcp] request handling failed');
    return jsonRpcError(500, -32603, 'Internal error');
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

function methodNotAllowed(): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST', ...NO_STORE },
  });
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed();
}
