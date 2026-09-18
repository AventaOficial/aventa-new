/**
 * READ-ONLY: load .env.local (first-wins like Next), resolve guards, hit staging REST.
 * No writes. No secrets printed.
 */
import fs from 'node:fs';
import {
  extractSupabaseProjectRef,
  evaluateSupabaseUrlForTarget,
  resolveAventaSupabaseTarget,
  STAGING_SUPABASE_REF,
} from '../lib/supabase/projectRefs.ts';

function loadEnvLocalFirstWins(path = '.env.local') {
  const env = { ...process.env };
  const text = fs.readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.trim().startsWith('#')) continue;
    const i = raw.indexOf('=');
    if (i < 0) continue;
    const k = raw.slice(0, i).trim();
    let v = raw.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // Next.js / dotenv: do not override already-set keys → first wins
    if (env[k] === undefined) env[k] = v;
  }
  return env;
}

const env = loadEnvLocalFirstWins();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = extractSupabaseProjectRef(url);
const target = resolveAventaSupabaseTarget(env);
const guard = evaluateSupabaseUrlForTarget({
  url,
  env,
  expectedRef: env.AVENTA_EXPECTED_SUPABASE_REF,
});

let rest = { ok: false, status: null, project_hint: null, error: null };
if (url && anon) {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/profiles?select=id&limit=0`, {
      method: 'GET',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Prefer: 'count=exact',
      },
    });
    rest.status = res.status;
    const hostRef = extractSupabaseProjectRef(url);
    rest.project_hint = hostRef;
    // 200 = OK; 206 etc.; RLS may filter but proves project auth against this host
    rest.ok = hostRef === STAGING_SUPABASE_REF && res.status >= 200 && res.status < 500;
    rest.reachable_staging = rest.ok;
  } catch (e) {
    rest.error = e instanceof Error ? e.message : 'fetch_failed';
  }
}

console.log(
  JSON.stringify(
    {
      resolved_url_ref: ref,
      resolved_target: target,
      expected: env.AVENTA_EXPECTED_SUPABASE_REF || null,
      guard_ok: guard.ok,
      guard_error: guard.ok ? null : guard.error,
      rest_readonly: {
        status: rest.status,
        host_ref: rest.project_hint,
        reachable_staging: rest.project_hint === STAGING_SUPABASE_REF && rest.status != null,
        error: rest.error,
      },
      is_ready:
        ref === STAGING_SUPABASE_REF &&
        target === 'staging' &&
        guard.ok &&
        rest.project_hint === STAGING_SUPABASE_REF,
    },
    null,
    2,
  ),
);

if (ref !== STAGING_SUPABASE_REF || !guard.ok) process.exit(2);
