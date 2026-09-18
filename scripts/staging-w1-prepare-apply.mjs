import fs from 'node:fs';

const STAGING = 'oojshofrpbfwsiypcecr';
const PROD = 'mkgsrpsuvedwwlzmzmzh';
const src = 'docs/supabase-migrations/STAGING_W1_RECONCILIATION_20260917.sql';
let sql = fs.readFileSync(src, 'utf8');

function stripSqlComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

const body = stripSqlComments(sql);
const safety = {
  file: src,
  target_project_id: STAGING,
  forbidden_project_id: PROD,
  bytes: sql.length,
  has_drop_table: /DROP\s+TABLE/i.test(body),
  has_truncate: /TRUNCATE/i.test(body),
  has_drop_schema: /DROP\s+SCHEMA/i.test(body),
};

if (safety.has_drop_table || safety.has_truncate || safety.has_drop_schema) {
  console.error(JSON.stringify({ abort: true, safety }, null, 2));
  process.exit(2);
}

// apply_migration wraps its own transaction — strip outer BEGIN/COMMIT
sql = sql.replace(/^\s*BEGIN\s*;\s*/im, '').replace(/\s*COMMIT\s*;\s*$/im, '\n');

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/staging_w1_apply.sql', sql);
console.log(JSON.stringify({ ...safety, stripped_begin_commit: true, out: 'tmp/staging_w1_apply.sql' }, null, 2));
