import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import type { MachineClientStatus } from '@/lib/mcp/contract';
import {
  MACHINE_CLIENT_BASE_COLUMNS,
  MACHINE_CLIENT_PUBLIC_COLUMNS,
  isMissingHunterCodeColumn,
  isMissingMachineClientsTable,
  isUuid,
  nextMachineClientStatus,
  parseMachineClientAction,
  parseMachineClientEdit,
  toPublicMachineClient,
} from '@/lib/mcp/machineClients';
import { SUPPLY_HUNTER_CODES, toSupplyHunterCode } from '@/lib/product/hunters/identity';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH { action: pause | resume | revoke } o { action: 'edit', name?, hunterCode?, dailyCandidateCap?, expiresAt? }.
 * Revocar es permanente. Un revocado no se edita. No hay DELETE.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const isEdit = Boolean(body && typeof body === 'object' && (body as { action?: unknown }).action === 'edit');
  const action = isEdit ? null : parseMachineClientAction(body);
  if (!isEdit && !action) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  const edit = isEdit ? parseMachineClientEdit(body, new Date(), { allowedHunterCodes: SUPPLY_HUNTER_CODES }) : null;
  if (edit && !edit.ok) return NextResponse.json({ error: edit.error }, { status: 400 });

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
  let update: Record<string, unknown>;
  if (edit?.ok) {
    if (from === 'revoked') return NextResponse.json({ error: 'Un cliente revocado no se edita' }, { status: 409 });
    update = { ...edit.patch };
  } else {
    const to = nextMachineClientStatus(from, action!);
    if (!to) return NextResponse.json({ error: `No se puede ${action} un cliente ${from}` }, { status: 409 });
    update = { status: to, ...(to === 'revoked' ? { revoked_at: new Date().toISOString() } : {}) };
  }

  const write = (columns: string) =>
    supabase.from('machine_clients').update(update).eq('id', id).eq('status', from).select(columns).maybeSingle();
  let { data, error } = await write(MACHINE_CLIENT_PUBLIC_COLUMNS);
  if (isMissingHunterCodeColumn(error) && !('hunter_code' in update)) {
    ({ data, error } = await write(MACHINE_CLIENT_BASE_COLUMNS));
  }
  if (error) {
    if (isMissingHunterCodeColumn(error)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de hunter_code' }, { status: 503 });
    }
    console.error('[admin/machine-clients] PATCH failed:', error.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'El cliente cambió de estado. Recarga.' }, { status: 409 });
  const client = toPublicMachineClient(data as unknown as Record<string, unknown>);
  return NextResponse.json({ ok: true, client: { ...client, hunterCode: toSupplyHunterCode(client.hunterCode) } });
}
