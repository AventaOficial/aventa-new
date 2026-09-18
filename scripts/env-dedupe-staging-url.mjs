/**
 * Deduplicate .env.local Supabase URL lines so the effective value is staging.
 * Does NOT print secrets. Only rewrites NEXT_PUBLIC_SUPABASE_URL occurrences.
 */
import fs from 'node:fs';

const STAGING_URL = 'https://oojshofrpbfwsiypcecr.supabase.co';
const PROD = 'mkgsrpsuvedwwlzmzmzh';
const STAGING = 'oojshofrpbfwsiypcecr';
const path = '.env.local';

function jwtRef(token) {
  if (!token || !token.includes('.')) return null;
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(
      payload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    const obj = JSON.parse(json);
    return obj.ref || null;
  } catch {
    return null;
  }
}

function stripQuotes(v) {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

const raw = fs.readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

const urlLines = [];
const anonLines = [];
const serviceLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line || line.trim().startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  const v = stripQuotes(line.slice(eq + 1));
  if (k === 'NEXT_PUBLIC_SUPABASE_URL') {
    const ref = (v.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1];
    urlLines.push({ i, ref, v });
  }
  if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
    anonLines.push({ i, ref: jwtRef(v) });
  }
  if (k === 'SUPABASE_SERVICE_ROLE_KEY') {
    serviceLines.push({ i, ref: jwtRef(v) });
  }
}

console.log(
  JSON.stringify(
    {
      before: {
        url_occurrences: urlLines.map((x) => ({ line: x.i + 1, ref: x.ref })),
        anon_ref_occurrences: anonLines.map((x) => ({ line: x.i + 1, ref: x.ref })),
        service_ref_occurrences: serviceLines.map((x) => ({
          line: x.i + 1,
          ref: x.ref,
        })),
      },
    },
    null,
    2,
  ),
);

// Strategy: keep a single NEXT_PUBLIC_SUPABASE_URL = staging.
// Remove extra URL lines. Prefer keeping the first URL line and rewriting it to staging,
// delete subsequent URL lines. Do NOT rewrite key values (user forbade other vars),
// but report if first-key ref is still prod (Next first-wins risk).

// Also drop earlier ANON/SERVICE lines whose JWT ref is PROD when a later
 // staging occurrence exists — same variable names duplicated; Next first-wins.
const hasStagingAnon = anonLines.some((x) => x.ref === STAGING);
const hasStagingService = serviceLines.some((x) => x.ref === STAGING);
const dropLine = new Set();
for (const x of anonLines) {
  if (hasStagingAnon && x.ref === PROD) dropLine.add(x.i);
}
for (const x of serviceLines) {
  if (hasStagingService && x.ref === PROD) dropLine.add(x.i);
}
// Keep only one staging anon + one staging service (first staging occurrence).
let anonKept = false;
let serviceKept = false;
for (const x of anonLines) {
  if (dropLine.has(x.i)) continue;
  if (x.ref === STAGING) {
    if (anonKept) dropLine.add(x.i);
    else anonKept = true;
  }
}
for (const x of serviceLines) {
  if (dropLine.has(x.i)) continue;
  if (x.ref === STAGING) {
    if (serviceKept) dropLine.add(x.i);
    else serviceKept = true;
  }
}

let urlKept = false;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (dropLine.has(i)) continue;
  const eq = line.indexOf('=');
  const k = eq >= 0 ? line.slice(0, eq).trim() : '';
  if (k === 'NEXT_PUBLIC_SUPABASE_URL') {
    if (!urlKept) {
      out.push(`NEXT_PUBLIC_SUPABASE_URL=${STAGING_URL}`);
      urlKept = true;
    }
    continue;
  }
  out.push(line);
}

// If file ended without trailing newline, preserve final empty only if original had it
let text = out.join(eol);
if (raw.endsWith('\n') && !text.endsWith('\n')) text += eol;
else if (!raw.endsWith('\n') && text.endsWith(eol)) {
  text = text.slice(0, -eol.length);
}

fs.writeFileSync(path, text, 'utf8');

// Re-scan
const after = fs.readFileSync(path, 'utf8');
const afterLines = after.split(/\r?\n/);
const urls = [];
const anons = [];
const services = [];
let expected = null;
let target = null;
for (const line of afterLines) {
  if (!line || line.trim().startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  const v = stripQuotes(line.slice(eq + 1));
  if (k === 'NEXT_PUBLIC_SUPABASE_URL') {
    urls.push((v.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1]);
  }
  if (k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') anons.push(jwtRef(v));
  if (k === 'SUPABASE_SERVICE_ROLE_KEY') services.push(jwtRef(v));
  if (k === 'AVENTA_EXPECTED_SUPABASE_REF') expected = v;
  if (k === 'AVENTA_SUPABASE_TARGET') target = v;
}

const firstWinsUrl = urls[0] || null;
const firstWinsAnon = anons[0] || null;
const firstWinsService = services[0] || null;

console.log(
  JSON.stringify(
    {
      after: {
        url_refs: urls,
        anon_refs: anons,
        service_refs: services,
        expected,
        target,
        next_first_wins: {
          url: firstWinsUrl,
          anon: firstWinsAnon,
          service: firstWinsService,
          url_is_staging: firstWinsUrl === STAGING,
          keys_match_url:
            firstWinsAnon === firstWinsUrl && firstWinsService === firstWinsUrl,
          warning_prod_keys_with_staging_url:
            firstWinsUrl === STAGING &&
            (firstWinsAnon === PROD || firstWinsService === PROD),
        },
      },
    },
    null,
    2,
  ),
);
