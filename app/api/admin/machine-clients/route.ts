import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { generateMachineToken } from '@/lib/mcp/tokens';
import { isMcpIngestEnabled } from '@/lib/mcp/flags';
import {
  MACHINE_CLIENT_BASE_COLUMNS,
  MACHINE_CLIENT_PUBLIC_COLUMNS,
  isMissingHunterCodeColumn,
  isMissingMachineClientsTable,
  loadMachineAuthorOptions,
  parseMachineClientCreate,
  toPublicMachineClient,
  validateMachineAuthor,
  type MachineClientPublic,
} from '@/lib/mcp/machineClients';
import { SUPPLY_HUNTER_CODES, supplyHunterOptions, toSupplyHunterCode } from '@/lib/product/hunters/identity';

/** Un slug guardado (p. ej. `ximena-fuego`) se muestra con su code de suministro. */
function forOwner(client: MachineClientPublic): MachineClientPublic {
  return { ...client, hunterCode: toSupplyHunterCode(client.hunterCode) };
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** GET: clientes MCP, sólo Owner. Nunca devuelve token ni hash. */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServerClient();
  const list = (columns: string) =>
    supabase.from('machine_clients').select(columns).order('created_at', { ascending: false }).limit(200);
  let { data, error } = await list(MACHINE_CLIENT_PUBLIC_COLUMNS);
  const hunterCodeReady = !isMissingHunterCodeColumn(error);
  if (!hunterCodeReady) ({ data, error } = await list(MACHINE_CLIENT_BASE_COLUMNS));
  if (error) {
    if (isMissingMachineClientsTable(error)) {
      return NextResponse.json({ clients: [], needsMigration: true, ingestEnabled: isMcpIngestEnabled() }, { headers: NO_STORE });
    }
    console.error('[admin/machine-clients] GET failed:', error.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }
  return NextResponse.json(
    {
      clients: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => forOwner(toPublicMachineClient(row))),
      needsMigration: false,
      ingestEnabled: isMcpIngestEnabled(),
      hunterCodeReady,
      hunters: supplyHunterOptions(),
      authors: await loadMachineAuthorOptions(supabase),
    },
    { headers: NO_STORE },
  );
}

/** POST: crea un cliente MCP. El token en claro se devuelve sólo en esta respuesta. */
export async function POST(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = parseMachineClientCreate(body, new Date(), { allowedHunterCodes: SUPPLY_HUNTER_CODES });
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
      ...(parsed.value.hunterCode ? { hunter_code: parsed.value.hunterCode } : {}),
    })
    .select(parsed.value.hunterCode ? MACHINE_CLIENT_PUBLIC_COLUMNS : MACHINE_CLIENT_BASE_COLUMNS)
    .single();
  if (error || !data) {
    if (isMissingMachineClientsTable(error)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de clientes MCP', needsMigration: true }, { status: 503 });
    }
    if (isMissingHunterCodeColumn(error)) {
      return NextResponse.json({ error: 'Falta aplicar la migración de hunter_code' }, { status: 503 });
    }
    console.error('[admin/machine-clients] POST failed:', error?.code ?? 'unknown');
    return NextResponse.json({ error: 'No se pudo crear' }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      client: forOwner(toPublicMachineClient(data as unknown as Record<string, unknown>)),
      token,
      tokenNotice: 'Guarda este token ahora. Aventa no lo vuelve a mostrar ni puede recuperarlo.',
    },
    { status: 201, headers: NO_STORE },
  );
}
