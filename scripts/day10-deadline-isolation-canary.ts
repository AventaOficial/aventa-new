/**
 * Day 10 — deterministic deadline-isolation canary (no network required).
 *
 *   npx tsx scripts/day10-deadline-isolation-canary.ts
 */

import {
  createDeadlineContext,
  DEFAULT_CRON_STAGE_CAPS,
} from '../lib/hunter/discovery/deadlineBudget';
import { SCHEDULED_CONTINUOUS_DEADLINE_MS } from '../lib/hunter/discovery/continuousCronContract';
import { classifySourceDiscoveryStatus } from '../lib/hunter/discovery/sourceDiscoveryStatus';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const soft = SCHEDULED_CONTINUOUS_DEADLINE_MS;
  const ctx = createDeadlineContext({ now: Date.now(), softDeadlineMs: soft });

  const hunter = ctx.allocate('hunter_collect');
  assert(hunter === DEFAULT_CRON_STAGE_CAPS.hunter_collect, 'hunter cap mismatch');
  assert(hunter < soft, 'hunter must not own full soft deadline');
  assert(
    hunter + DEFAULT_CRON_STAGE_CAPS.persist <= soft,
    'hunter+persist must fit soft wall',
  );

  ctx.recordUsed('hunter_collect', hunter);
  const sticky = ctx.allocate('sticky_pm');
  assert(sticky > 0, 'sticky must still receive budget after hunter soft_deadline');

  const persist = ctx.allocate('persist');
  assert(persist > 0, 'persist reserve must remain grantable');

  assert(
    classifySourceDiscoveryStatus({
      ok: false,
      errorCode: 'soft_deadline',
    }) === 'SKIPPED',
    'soft_deadline must be SKIPPED not FAILED',
  );

  const out = {
    ok: true,
    soft_deadline_ms: soft,
    hunter_granted_ms: hunter,
    sticky_granted_ms: sticky,
    persist_granted_ms: persist,
    hunter_isolation: hunter < soft,
    sticky_survives_hunter: sticky > 0,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
