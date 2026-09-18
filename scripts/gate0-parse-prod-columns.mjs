import fs from 'node:fs';

function extractJsonArray(raw) {
  const marker = raw.indexOf('[{"');
  if (marker < 0) throw new Error('no json array found');
  // Prefer untrusted boundary content
  const startTag = raw.indexOf('<untrusted-data-');
  if (startTag >= 0) {
    const gt = raw.indexOf('>', startTag);
    const endTag = raw.indexOf('</untrusted-data-', gt);
    if (gt > 0 && endTag > gt) {
      return JSON.parse(raw.slice(gt + 1, endTag).trim());
    }
  }
  // Fallback: find first [ ... last ]
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  return JSON.parse(raw.slice(start, end + 1));
}

const src =
  'C:/Users/yanin/.cursor/projects/e-AVENTA-NEW-aventa-new/agent-tools/8cc86d93-04a4-4166-9497-07f4233f3235.txt';
const cols = extractJsonArray(fs.readFileSync(src, 'utf8'));
fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/gate0_prod_foundation_columns.json', JSON.stringify(cols, null, 2));

const by = {};
for (const c of cols) {
  (by[c.table_name] ||= []).push(c);
}
console.log(
  JSON.stringify(
    {
      columns: cols.length,
      tables: Object.keys(by).sort(),
      counts: Object.fromEntries(Object.keys(by).sort().map((t) => [t, by[t].length])),
    },
    null,
    2,
  ),
);
