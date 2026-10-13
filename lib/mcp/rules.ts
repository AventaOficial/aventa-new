import {
  ALIEXPRESS_REGISTERED_DOMAINS,
  AMAZON_REGISTERED_DOMAINS,
  EBAY_REGISTERED_DOMAINS,
  MERCADOLIBRE_REGISTERED_DOMAINS,
  MX_COMMERCE_REGISTERED_DOMAINS,
  SHEIN_REGISTERED_DOMAINS,
  TEMU_REGISTERED_DOMAINS,
  WALMART_REGISTERED_DOMAINS,
} from '@/lib/offers/commerceHostAllowlist';
import type { MachineClientContext } from '@/lib/mcp/auth';
import {
  MCP_CALLS_PER_MINUTE,
  MCP_CURRENCY,
  MCP_HUNTER_COMMENT_MAX,
  MCP_IDEMPOTENCY_KEY_MAX,
  MCP_IDEMPOTENCY_KEY_MIN,
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_NOTE_MAX,
  MCP_PILOT_MAX_ACCEPTED_PER_RUN,
  MCP_TITLE_MAX,
  MCP_TOOL_SCOPE,
  MCP_TOOLS,
} from '@/lib/mcp/contract';
import { isMcpIngestEnabled } from '@/lib/mcp/flags';
import { buildDespensaMissionBrief } from '@/lib/despensa/missions';
import type { McpQuota } from '@/lib/mcp/submissions';

export function supportedStoreDomains(): string[] {
  return [
    ...new Set<string>([
      ...AMAZON_REGISTERED_DOMAINS,
      ...MERCADOLIBRE_REGISTERED_DOMAINS,
      ...WALMART_REGISTERED_DOMAINS,
      ...ALIEXPRESS_REGISTERED_DOMAINS,
      ...TEMU_REGISTERED_DOMAINS,
      ...SHEIN_REGISTERED_DOMAINS,
      ...EBAY_REGISTERED_DOMAINS,
      ...MX_COMMERCE_REGISTERED_DOMAINS,
    ]),
  ].sort();
}

/** get_submission_rules: reglas públicas del contrato. Sin arquitectura interna. */
export function buildSubmissionRules(client: MachineClientContext, quota: McpQuota | null) {
  return {
    ingestEnabled: isMcpIngestEnabled() && client.status === 'active',
    currency: MCP_CURRENCY,
    limits: {
      maxCandidatesPerCall: MCP_MAX_CANDIDATES_PER_CALL,
      maxAcceptedPerRun: MCP_PILOT_MAX_ACCEPTED_PER_RUN,
      runIdRequired: true,
      titleMaxChars: MCP_TITLE_MAX,
      noteMaxChars: MCP_NOTE_MAX,
      hunterCommentMaxChars: MCP_HUNTER_COMMENT_MAX,
      idempotencyKeyChars: { min: MCP_IDEMPOTENCY_KEY_MIN, max: MCP_IDEMPOTENCY_KEY_MAX, pattern: '[A-Za-z0-9._:-]' },
      callsPerMinute: MCP_CALLS_PER_MINUTE,
    },
    dailyQuota: quota ?? { dailyCap: client.dailyCandidateCap, usedToday: null, remainingToday: null },
    dailyQuotaResets: '00:00 UTC',
    candidate: {
      required: ['url', 'title', 'price', 'currency', 'observedAt'],
      optional: ['originalPrice', 'note', 'hunterComment'],
      notes: [
        'url: https, tienda soportada, sin credenciales, puerto, IP, query (?) ni fragmento (#).',
        'title, note y hunterComment: texto plano, sin HTML ni caracteres de control.',
        'note es contexto para el equipo. hunterComment es un borrador para el comprador: una o dos frases en español con datos verificables. Si no hay nada útil, omítelo.',
        'hunterComment no puede afirmar «precio histórico», «el más barato», «últimas unidades», urgencia, ahorros ni comparaciones con otras tiendas, ni mencionarse como bot o IA. Solo menciona descuento o porcentaje si la tienda muestra un precio de lista mayor. Si no cumple (incluido pasar del tope de caracteres o traer HTML), Aventa descarta solo el comentario y el candidato sigue su curso.',
        'price > 0. originalPrice, si viene, debe ser mayor que price.',
        'observedAt: ISO 8601 con zona horaria, no futuro, máximo 30 días de antigüedad.',
        `runId es obligatorio: como máximo ${MCP_PILOT_MAX_ACCEPTED_PER_RUN} candidatos aceptados por runId, sumando todas sus llamadas. Lo que exceda vuelve como RUN_CAP_REACHED.`,
        'Usa un runId nuevo en cada corrida y el mismo runId en todas las llamadas y reintentos de esa corrida. Un runId ya usado no recupera cupo.',
        'Para reintentar una llamada fallida, repite la misma idempotencyKey con el mismo payload; una idempotencyKey nueva es otro envío.',
        'Los datos enviados son pistas. Aventa verifica cada candidato y un humano decide.',
      ],
    },
    supportedStores: supportedStoreDomains(),
    tools: MCP_TOOLS.map((name) => ({ name, scope: MCP_TOOL_SCOPE[name] })),
    grantedScopes: [...client.scopes],
    despensa: buildDespensaMissionBrief(),
  };
}
