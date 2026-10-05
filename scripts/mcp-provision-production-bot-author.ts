/**
 * MCP Grok Bots — provisiona el autor bot dedicado de PRODUCTION (usuario Auth + perfil).
 *
 * PRODUCTION ONLY (mkgsrpsuvedwwlzmzmzh). Lógica y guardas: lib/mcp/botAuthorProvisioning.ts.
 * - Exige AVENTA_TARGET=production, AVENTA_EXPECTED_SUPABASE_REF=mkgsrpsuvedwwlzmzmzh, URL de production
 *   y SUPABASE_SERVICE_ROLE_KEY real de production. Rechaza staging.
 * - Por defecto es un ensayo: sólo lee (Auth, profiles, user_roles) y muestra el plan. Escribe sólo con --apply.
 * - Sin contraseña, sin user_roles, sin Rewards ni comisiones, sin machine_clients, sin tocar ofertas.
 * - Si el usuario ya existe, lo valida y aborta ante cualquier discrepancia; nunca lo modifica.
 * - Imprime sólo el UUID del autor y un resumen seguro. Nunca la service role key.
 *
 * Uso:
 *   npx tsx scripts/mcp-provision-production-bot-author.ts                      (ensayo, lee .env.production.local)
 *   npx tsx scripts/mcp-provision-production-bot-author.ts --apply              (crea el usuario)
 *   npx tsx scripts/mcp-provision-production-bot-author.ts --env-file <ruta> [--apply]
 * Sólo se usan las variables del archivo; el entorno del shell, .env.local y .env.staging.local se ignoran.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  INERT_PROFILE_COLUMNS,
  isAllowedProductionEnvFile,
  maskedBotEmail,
  PRODUCTION_BOT_USERNAME,
  provisionProductionBotAuthor,
  type BotProvisionDeps,
  type ProfileLite,
} from '@/lib/mcp/botAuthorProvisioning';

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
  const apply = argv.includes('--apply');
  const i = argv.indexOf('--env-file');
  const envPath = i === -1 ? '.env.production.local' : argv[i + 1];
  if (!envPath || !isAllowedProductionEnvFile(envPath)) stop('archivo de entorno no permitido (sólo .env.production.local o uno explícito de production)');
  if (!existsSync(envPath)) stop('no existe el archivo de entorno de production');
  const env = parseEnvFile(envPath);

  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const sb = createClient(url || 'https://invalid.local', key || 'invalid', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deps: BotProvisionDeps = {
    async listUsersPage(page, perPage) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      return error ? null : (data.users ?? []);
    },
    async createUser(input) {
      const { data, error } = await sb.auth.admin.createUser(input);
      return error || !data.user ? null : data.user.id;
    },
    async probeProfileSchema() {
      const { error } = await sb.from('profiles').select(INERT_PROFILE_COLUMNS).limit(0);
      return !error;
    },
    async findProfileIdsByUsername(username) {
      const { data, error } = await sb.from('profiles').select('id').eq('username', username).limit(5);
      return error ? null : (data ?? []).map((r) => String(r.id));
    },
    async getProfile(id) {
      const { data, error } = await sb.from('profiles').select(INERT_PROFILE_COLUMNS).eq('id', id).maybeSingle();
      if (error) return 'error';
      return (data as ProfileLite | null) ?? null;
    },
    async insertProfile(row) {
      const { error } = await sb.from('profiles').insert(row);
      return !error;
    },
    async setProfileUsername(id, username) {
      const { error } = await sb.from('profiles').update({ username }).eq('id', id);
      return !error;
    },
    async countUserRoles(id) {
      const { count, error } = await sb.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('user_id', id);
      return error ? null : (count ?? 0);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  const result = await provisionProductionBotAuthor(env, deps, { apply });
  if (!result.ok) stop(`production bot author (${result.stage})`, result.reasons);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: result.mode,
        plan: result.plan,
        created: result.created,
        authorProfileId: result.authorProfileId,
        identity: { email: maskedBotEmail(), username: PRODUCTION_BOT_USERNAME },
        checks: result.checks,
        next:
          result.authorProfileId
            ? `Vercel (Production): MCP_BOT_AUTHOR_USER_IDS=${result.authorProfileId}`
            : 'Ensayo correcto. Repetir con --apply para crear el usuario.',
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
