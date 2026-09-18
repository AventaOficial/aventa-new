import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
let url = '';
for (const raw of t.split(/\n/)) {
  const line = raw.replace(/\r$/, '').trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    url = line.slice('NEXT_PUBLIC_SUPABASE_URL='.length).replace(/^["']|["']$/g, '');
  }
}
const ref = url.replace(/^https?:\/\//, '').split('.')[0];
console.log(ref);
console.log(`https://supabase.com/dashboard/project/${ref}/sql/new`);
