import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { McpToolName } from '@/lib/mcp/contract';

export type MachineCallAudit = {
  machineClientId: string;
  tool: McpToolName;
  requestId: string;
  resultStatus: string;
  acceptedCount?: number;
  rejectedCount?: number;
  duplicateCount?: number;
  latencyMs: number;
};

export function newMcpRequestId(): string {
  return randomUUID();
}

function count(n: number | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Fila append-only en machine_client_calls.
 * Sólo metadatos: nunca token, cabecera Authorization, payload ni contenido de terceros.
 * Un fallo de auditoría no rompe la llamada.
 */
export async function recordMachineCall(supabase: SupabaseClient, audit: MachineCallAudit): Promise<void> {
  try {
    const { error } = await supabase.from('machine_client_calls').insert({
      machine_client_id: audit.machineClientId,
      tool: audit.tool,
      request_id: audit.requestId.slice(0, 64),
      result_status: audit.resultStatus.slice(0, 40),
      accepted_count: count(audit.acceptedCount),
      rejected_count: count(audit.rejectedCount),
      duplicate_count: count(audit.duplicateCount),
      latency_ms: count(Math.round(audit.latencyMs)),
    });
    if (error) console.error('[mcp-audit] insert failed:', error.code ?? 'unknown');
  } catch {
    console.error('[mcp-audit] insert threw');
  }
}
