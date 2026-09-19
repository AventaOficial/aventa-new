/**
 * Consolidate N≤3 soak evidence after successful replacements.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { listDistributionOpsPublications } from '../../lib/distribution/opsSurface';
import { isDistributionEngineEnabled } from '../../lib/distribution/constants';
import { isMachinePendingWriteEnabled } from '../../lib/bots/ingest/machineLiveInsertEligibility';
import { STAGING_SOAK_CANARY_DESTINATION_ID } from '../../lib/distribution/stagingCanary';

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

const SUCCESS_IDS = [
  'c3d7217f-9885-411a-8dd5-47f72d5fded4',
  '93a0de60-fa2f-424d-838f-cd1578f2d629',
  'fc1a6140-a49f-40b1-a051-8a9842d8c4ac',
] as const;

const FAILED_IDS = [
  '3b6283db-e37c-4ec7-8006-d184928e528d',
  'affe2928-921c-4b4c-968c-8500c0069cea',
] as const;

async function main() {
  load(join(process.cwd(), '.env.local'));
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: pubs } = await sb
    .from('distribution_publications')
    .select(
      'id, offer_id, destination_id, status, external_message_id, idempotency_key, distribution_version, last_error_code, last_error_message',
    )
    .in('id', [...SUCCESS_IDS, ...FAILED_IDS]);

  const ops = await listDistributionOpsPublications(sb, {
    filter: 'all',
    limit: 30,
    env: process.env,
  });

  const opsHits = ops.publications.filter((p) =>
    (SUCCESS_IDS as readonly string[]).includes(p.id),
  );

  const report = {
    ok: true,
    at: new Date().toISOString(),
    version: 20260920,
    destinationId: STAGING_SOAK_CANARY_DESTINATION_ID,
    successfulPublications: (pubs ?? []).filter((p) =>
      (SUCCESS_IDS as readonly string[]).includes(String(p.id)),
    ),
    failedExplained: (pubs ?? []).filter((p) =>
      (FAILED_IDS as readonly string[]).includes(String(p.id)),
    ),
    opsSurface: opsHits.map((p) => ({
      id: p.id,
      status: p.status,
      operatorStatus: p.operatorStatus,
      destinationId: p.destinationId,
      externalMessageId: p.externalMessageId,
      lastEvent: p.lastEvent?.eventType ?? null,
      requiresOperatorReconcile: p.requiresOperatorReconcile,
    })),
    flags: {
      processDistributionEnabled: isDistributionEngineEnabled(process.env),
      machineWrites: isMachinePendingWriteEnabled(),
      opsEngineEnabled: ops.engineEnabled,
    },
    distributionStagingStatus: 'CLOSED',
  };

  const dir = join(process.cwd(), 'scripts/_distribution_soak_reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'soak-n3-closed.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
