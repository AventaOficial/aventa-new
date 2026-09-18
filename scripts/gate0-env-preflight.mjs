import fs from 'node:fs';

const p = '.env.local';
const t = fs.readFileSync(p, 'utf8');
const get = (k) => {
  const m = t.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
};

const url = get('NEXT_PUBLIC_SUPABASE_URL') || '';
const expected = get('AVENTA_EXPECTED_SUPABASE_REF') || '';
const target = get('AVENTA_SUPABASE_TARGET') || '';
const ref = (url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i) || [])[1] || 'NONE';
const STAGING = 'oojshofrpbfwsiypcecr';
const PROD = 'mkgsrpsuvedwwlzmzmzh';

const out = {
  url_ref: ref,
  expected_ref: expected || null,
  target: target || null,
  is_staging:
    ref === STAGING &&
    (expected === '' || expected === STAGING) &&
    (target === '' || target === 'staging'),
  is_prod: ref === PROD || expected === PROD,
};

console.log(JSON.stringify(out, null, 2));
if (out.is_prod || !out.is_staging) process.exit(2);
