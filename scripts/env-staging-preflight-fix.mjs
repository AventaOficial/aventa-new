import fs from 'node:fs';

const STAGING = 'oojshofrpbfwsiypcecr';
const PROD = 'mkgsrpsuvedwwlzmzmzh';
const path = '.env.local';

function parseEnv(text) {
  const map = new Map();
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
    map.set(k, v);
  }
  return map;
}

function refFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function hostFromUrl(url) {
  const m = String(url || '').match(/https?:\/\/([^/]+)/i);
  return m ? m[1] : null;
}

/** Decode JWT payload ref claim without printing the token. */
function jwtRef(token) {
  if (!token || !token.includes('.')) return null;
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const obj = JSON.parse(json);
    return obj.ref || obj.project_ref || null;
  } catch {
    return null;
  }
}

const before = fs.readFileSync(path, 'utf8');
const env = parseEnv(before);
const url = env.get('NEXT_PUBLIC_SUPABASE_URL') || '';
const urlRef = refFromUrl(url);
const expected = env.get('AVENTA_EXPECTED_SUPABASE_REF') || null;
const target = env.get('AVENTA_SUPABASE_TARGET') || null;
const anonRef = jwtRef(env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
const serviceRef = jwtRef(env.get('SUPABASE_SERVICE_ROLE_KEY'));

const report = {
  phase: 'before',
  url_host: hostFromUrl(url),
  url_ref: urlRef,
  expected,
  target,
  anon_key_ref_claim: anonRef,
  service_key_ref_claim: serviceRef,
  keys_present: [...env.keys()],
};

let changed = false;
if (urlRef === PROD || (urlRef && urlRef !== STAGING)) {
  const nextUrl = `https://${STAGING}.supabase.co`;
  // Replace only the NEXT_PUBLIC_SUPABASE_URL line value; preserve quoting style if present.
  const updated = before.replace(
    /^(NEXT_PUBLIC_SUPABASE_URL=)(.*)$/m,
    (_, prefix, oldVal) => {
      const trimmed = oldVal.trim();
      const q =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
          ? trimmed[0]
          : '';
      return `${prefix}${q}${nextUrl}${q}`;
    },
  );
  if (updated === before) throw new Error('Failed to locate NEXT_PUBLIC_SUPABASE_URL line');
  fs.writeFileSync(path, updated, 'utf8');
  changed = true;
}

const afterText = fs.readFileSync(path, 'utf8');
const after = parseEnv(afterText);
const afterUrl = after.get('NEXT_PUBLIC_SUPABASE_URL') || '';

console.log(
  JSON.stringify(
    {
      ...report,
      changed,
      phase_after: {
        url_host: hostFromUrl(afterUrl),
        url_ref: refFromUrl(afterUrl),
        expected: after.get('AVENTA_EXPECTED_SUPABASE_REF') || null,
        target: after.get('AVENTA_SUPABASE_TARGET') || null,
        anon_key_ref_claim: jwtRef(after.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')),
        service_key_ref_claim: jwtRef(after.get('SUPABASE_SERVICE_ROLE_KEY')),
        key_url_mismatch:
          jwtRef(after.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')) != null &&
          jwtRef(after.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')) !== refFromUrl(afterUrl),
      },
    },
    null,
    2,
  ),
);
