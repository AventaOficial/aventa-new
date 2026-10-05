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
  MCP_IDEMPOTENCY_KEY_MAX,
  MCP_IDEMPOTENCY_KEY_MIN,
  MCP_MAX_CANDIDATES_PER_CALL,
  MCP_NOTE_MAX,
  MCP_TITLE_MAX,
  MCP_TOOL_SCOPE,
  MCP_TOOLS,
} from '@/lib/mcp/contract';
import { isMcpIngestEnabled } from '@/lib/mcp/flags';
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
      titleMaxChars: MCP_TITLE_MAX,
      noteMaxChars: MCP_NOTE_MAX,
      idempotencyKeyChars: { min: MCP_IDEMPOTENCY_KEY_MIN, max: MCP_IDEMPOTENCY_KEY_MAX, pattern: '[A-Za-z0-9._:-]' },
      callsPerMinute: MCP_CALLS_PER_MINUTE,
    },
    dailyQuota: quota ?? { dailyCap: client.dailyCandidateCap, usedToday: null, remainingToday: null },
    dailyQuotaResets: '00:00 UTC',
    candidate: {
      required: ['url', 'title', 'price', 'currency', 'observedAt'],
      optional: ['originalPrice', 'note'],
      notes: [
        'url: https, tienda soportada, sin credenciales, puerto, IP, query (?) ni fragmento (#).',
        'title y note: texto plano, sin HTML ni caracteres de control.',
        'price > 0. originalPrice, si viene, debe ser mayor que price.',
        'observedAt: ISO 8601 con zona horaria, no futuro, máximo 30 días de antigüedad.',
        'Los datos enviados son pistas. Aventa verifica cada candidato y un humano decide.',
      ],
    },
    supportedStores: supportedStoreDomains(),
    tools: MCP_TOOLS.map((name) => ({ name, scope: MCP_TOOL_SCOPE[name] })),
    grantedScopes: [...client.scopes],
  };
}
