/**
 * CommonJS/ESM-friendly mirror of lib/supabase/projectRefs.ts for .mjs scripts.
 * Keep constants in sync with the TypeScript module.
 */

export const PRODUCTION_SUPABASE_REF = 'mkgsrpsuvedwwlzmzmzh';
export const STAGING_SUPABASE_REF = 'oojshofrpbfwsiypcecr';

export function extractSupabaseProjectRef(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return m ? m[1].toLowerCase() : null;
  } catch {
    const stripped = raw.replace(/^https?:\/\//i, '').split('/')[0] ?? '';
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(stripped);
    return m ? m[1].toLowerCase() : null;
  }
}

export function assertStagingSupabaseUrl(url, env = process.env) {
  if (String(env.AVENTA_SKIP_SUPABASE_REF_GUARD ?? '').trim() === '1') {
    return extractSupabaseProjectRef(url) ?? 'skipped';
  }
  const ref = extractSupabaseProjectRef(url);
  const expected = String(env.AVENTA_EXPECTED_SUPABASE_REF ?? STAGING_SUPABASE_REF)
    .trim()
    .toLowerCase();

  if (!ref) {
    console.error(
      'ABORT: cannot parse Supabase project-ref from NEXT_PUBLIC_SUPABASE_URL.',
    );
    process.exit(2);
  }
  if (ref === PRODUCTION_SUPABASE_REF) {
    console.error(
      `ABORT: staging operation refused against PRODUCTION Supabase (${PRODUCTION_SUPABASE_REF}).`,
    );
    console.error(`Use staging project ${STAGING_SUPABASE_REF} and set .env.local accordingly.`);
    process.exit(2);
  }
  if (ref !== expected) {
    console.error(
      `ABORT: expected staging ref "${expected}", got "${ref}".`,
    );
    process.exit(2);
  }
  return ref;
}
