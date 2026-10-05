/**
 * MCP Grok Bots — provisiona el autor bot dedicado de STAGING (usuario Auth + perfil).
 *
 * STAGING ONLY (oojshofrpbfwsiypcecr). Idempotente.
 * - Exige AVENTA_TARGET=staging, AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr y URL/key de staging.
 * - Sin contraseña: la cuenta no puede iniciar sesión.
 * - No crea user_roles, no toca Rewards ni comisiones, no crea machine_clients ni tokens.
 * - Imprime sólo el UUID del autor y un resumen seguro. Nunca la service role key.
 *
 * Uso:
 *   npx tsx scripts/mcp-provision-staging-bot-author.ts                       (lee .env.staging.local)
 *   npx tsx scripts/mcp-provision-staging-bot-author.ts --env-file <ruta>
 * Sólo se usan las variables del archivo; el entorno del shell y .env.local se ignoran.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { evaluateStagingProvisionGuard } from '@/lib/mcp/preflight';

const BOT_EMAIL = 'mcp-supply-staging@aventa.internal';
const BOT_DISPLAY = 'Aventa MCP Supply (staging)';
const BOT_USERNAME = 'aventa_mcp_supply_staging';
const INGEST_AUTHOR_S72 = '778cfbf5-294e-4866-883f-71e3046566cb';

function parseEnvFile(path: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function stop(reason: string, details: string[] = []): never {
  console.error(`STOP: ${reason}`);
  for (const d of details) console.error(`  - ${d}`);
  process.exit(1);
}

async function main() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--env-file');
  const envPath = i === -1 ? '.env.staging.local' : argv[i + 1];
  if (!envPath || !existsSync(envPath)) stop('no existe el archivo de entorno de staging');
  const env = parseEnvFile(envPath);

  const guard = evaluateStagingProvisionGuard(env);
  if (!guard.ok) stop('el entorno no es staging', guard.reasons);

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!.trim(), env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) stop('no se pudo listar usuarios de Auth');
  const existing = (listed.users ?? []).find((u) => u.email?.toLowerCase() === BOT_EMAIL);

  let userId: string;
  let created = false;
  if (existing) {
    if (existing.app_metadata?.mcp_bot_author !== true) stop('ya existe un usuario con ese email que no es el autor MCP; revisar a mano');
    userId = existing.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: BOT_EMAIL,
      email_confirm: true,
      user_metadata: { display_name: BOT_DISPLAY },
      app_metadata: { aventa_machine_author: true, mcp_bot_author: true, role_hint: 'mcp_supply' },
    });
    if (error || !data.user) stop('createUser falló');
    userId = data.user.id;
    created = true;
  }
  if (userId === INGEST_AUTHOR_S72) stop('el autor MCP no puede ser el autor de ingesta S7.2');

  await new Promise((r) => setTimeout(r, 800));
  const { data: profile } = await sb.from('profiles').select('id').eq('id', userId).maybeSingle();
  const { error: profileError } = profile
    ? await sb.from('profiles').update({ display_name: BOT_DISPLAY, username: BOT_USERNAME }).eq('id', userId)
    : await sb.from('profiles').insert({ id: userId, display_name: BOT_DISPLAY, username: BOT_USERNAME, role: 'user' });
  if (profileError) stop('no se pudo crear o actualizar el perfil');

  const { data: roles, error: rolesErr } = await sb.from('user_roles').select('role').eq('user_id', userId);
  if (rolesErr) stop('no se pudo verificar user_roles');
  if ((roles ?? []).length > 0) stop('el autor bot tiene roles; quitarlos antes de continuar');

  const { data: check, error: checkErr } = await sb
    .from('profiles')
    .select(
      'role, is_trusted, trusted, owner_auto_approve_offers, commissions_accepted_at, reward_program_unlocked_at, rewards_terms_accepted_at, reputation_score, achievement_xp',
    )
    .eq('id', userId)
    .single();
  if (checkErr || !check) stop('no se pudo leer el perfil');
  const c = check as Record<string, unknown>;
  const inert =
    c.role === 'user' &&
    c.is_trusted === false &&
    c.trusted !== true &&
    c.owner_auto_approve_offers === false &&
    c.commissions_accepted_at == null &&
    c.reward_program_unlocked_at == null &&
    c.rewards_terms_accepted_at == null &&
    Number(c.reputation_score) === 0 &&
    Number(c.achievement_xp) === 0;
  if (!inert) stop('el perfil no está en estado económicamente inerte');

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        authorProfileId: userId,
        checks: { stagingRef: guard.ref, password: 'none', userRoles: 0, economicallyInert: true, machineClients: 'not_created' },
        next: `Vercel (staging/Preview): MCP_BOT_AUTHOR_USER_IDS=${userId}`,
      },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error('STOP: error inesperado');
  process.exit(1);
});
