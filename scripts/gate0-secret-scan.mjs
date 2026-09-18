import fs from 'node:fs';

const files = [
  'tmp/staging-prod-schema-diff.json',
  'docs/SYSTEMS/STAGING_SCHEMA_FORENSIC_DIFF.md',
  'docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql',
  'scripts/gate0-author-foundation.mjs',
  'scripts/gate0-env-preflight.mjs',
];

const patterns = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\./,
  /service_role['\":=\s]+[A-Za-z0-9._-]{40,}/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/i,
  /BOT_TOKEN\s*=\s*\S+/i,
  /password\s*=\s*['\"][^'\"]{8,}/i,
];

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log(f, 'MISSING');
    continue;
  }
  const t = fs.readFileSync(f, 'utf8');
  const hits = patterns.filter((p) => p.test(t)).length;
  console.log(JSON.stringify({ file: f, bytes: t.length, secret_like_hits: hits }));
}
