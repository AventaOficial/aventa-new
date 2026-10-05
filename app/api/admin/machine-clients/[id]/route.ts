import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import type { MachineClientStatus } from '@/lib/mcp/contract';
import {
  MACHINE_CLIENT_PUBLIC_COLUMNS,
  isMissingMachineClientsTable,
  isUuid,
  nextMachineClientStatus,
  parseMachineClientAction,
  toPublicMachineClient,
} from '@/lib/mcp/machineClients';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { action: pause | resume | revoke }. Revocar es permanente. No hay DELETE. */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const action = parseMachineClientAction(await request.json().catch(() => null));
  if (!action) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });

  const supabase = createServerClient();
  const { data: current, error: readError } = await supabase
    .from('machine_clients')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (readError) {
    if (isMissingMachineClientsTable(readError)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de clientes MCP', needsMigration: true }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo leer' }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const from = (current as { status: MachineClientStatus }).status;
  const to = nextMachineClientStatus(from, action);
  if (!to) return NextResponse.json({ error: `No se puede ${action} un cliente ${from}` }, { status: 409 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('machine_clients')
    .update({ status: to, ...(to === 'revoked' ? { revoked_at: now } : {}) })
    .eq('id', id)
    .eq('status', from)
    .select(MACHINE_CLIENT_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error('[admin/machine-clients] PATCH failed:', error.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'El cliente cambió de estado. Recarga.' }, { status: 409 });
  return NextResponse.json({ ok: true, client: toPublicMachineClient(data as Record<string, unknown>) });
}
