import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { generateMachineToken } from '@/lib/mcp/tokens';
import { isMcpIngestEnabled } from '@/lib/mcp/flags';
import {
  MACHINE_CLIENT_PUBLIC_COLUMNS,
  isMissingMachineClientsTable,
  parseMachineClientCreate,
  toPublicMachineClient,
  validateMachineAuthor,
} from '@/lib/mcp/machineClients';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** GET: clientes MCP, sólo Owner. Nunca devuelve token ni hash. */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('machine_clients')
    .select(MACHINE_CLIENT_PUBLIC_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingMachineClientsTable(error)) {
      return NextResponse.json({ clients: [], needsMigration: true, ingestEnabled: isMcpIngestEnabled() }, { headers: NO_STORE });
    }
    console.error('[admin/machine-clients] GET failed:', error.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
  return NextResponse.json(
    {
      clients: ((data ?? []) as Record<string, unknown>[]).map(toPublicMachineClient),
      needsMigration: false,
      ingestEnabled: isMcpIngestEnabled(),
    },
    { headers: NO_STORE },
  );
}

/** POST: crea un cliente MCP. El token en claro se devuelve sólo en esta respuesta. */
export async function POST(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = parseMachineClientCreate(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createServerClient();
  const author = await validateMachineAuthor(supabase, parsed.value.authorProfileId, auth.user.id);
  if (!author.ok) return NextResponse.json({ error: author.error }, { status: 400 });

  const { token, prefix, hash } = generateMachineToken();
  const { data, error } = await supabase
    .from('machine_clients')
    .insert({
      name: parsed.value.name,
      token_prefix: prefix,
      token_hash: hash,
      scopes: parsed.value.scopes,
      status: 'active',
      author_profile_id: parsed.value.authorProfileId,
      daily_candidate_cap: parsed.value.dailyCandidateCap,
      expires_at: parsed.value.expiresAt,
      created_by: auth.user.id,
    })
    .select(MACHINE_CLIENT_PUBLIC_COLUMNS)
    .single();
  if (error || !data) {
    if (isMissingMachineClientsTable(error)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de clientes MCP', needsMigration: true }, { status: 503 });
    }
    console.error('[admin/machine-clients] POST failed:', error?.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo crear' }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      client: toPublicMachineClient(data as Record<string, unknown>),
      token,
      tokenNotice: 'Guarda este token ahora. Aventa no lo vuelve a mostrar ni puede recuperarlo.',
    },
    { status: 201, headers: NO_STORE },
  );
}
