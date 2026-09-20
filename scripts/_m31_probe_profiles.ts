import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1].trim()] == null) process.env[m[1].trim()] = v;
  }
}

async function main() {
  loadEnv('.env.local');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const out: Record<string, unknown> = {};
  const a = await sb.from('profiles').select('id', { count: 'exact', head: true });
  out.count = a.count;
  out.countErr = a.error?.message ?? null;
  const b = await sb
    .from('profiles')
    .select('id, reward_program_unlocked_at')
    .not('reward_program_unlocked_at', 'is', null)
    .limit(5);
  out.unlocked = b.data?.length ?? 0;
  out.unlockedErr = b.error?.message ?? null;
  out.unlockedSample = b.data ?? [];
  const c = await sb.from('profiles').select('id').limit(25);
  out.sample = (c.data ?? []).length;
  out.sampleErr = c.error?.message ?? null;

  writeFileSync('scripts/_m31_profiles.json', JSON.stringify(out, null, 2));
  console.error('wrote profiles probe');
}

main().catch((e) => {
  writeFileSync(
    'scripts/_m31_profiles.json',
    JSON.stringify({ fatal: String(e) }, null, 2),
  );
  process.exit(1);
});
