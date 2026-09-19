import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { listDistributionOpsPublications } from '../../lib/distribution/opsSurface';

function load(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]!] !== undefined) continue;
    let v = m[2]!;
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]!] = v;
  }
}

load('.env.local');

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const r = await listDistributionOpsPublications(sb, {
    filter: 'published',
    limit: 10,
    env: process.env,
  });
  const hit = r.publications.find((p) => p.id === '6cd3df87-ca51-4f5e-ac37-3e96f8210f9b');
  console.log(
    JSON.stringify(
      {
        engineEnabled: r.engineEnabled,
        found: Boolean(hit),
        row: hit
          ? {
              id: hit.id,
              status: hit.status,
              operatorStatus: hit.operatorStatus,
              destinationId: hit.destinationId,
              externalMessageId: hit.externalMessageId,
              idempotencyKey: hit.idempotencyKey,
              requiresOperatorReconcile: hit.requiresOperatorReconcile,
              lastEvent: hit.lastEvent?.eventType ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
