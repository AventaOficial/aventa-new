/**
 * S9.1 — Supply write authority boundary.
 * Proves single machine mint path + discovery-only legacy cron.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  assertMachineOfferWriteAuthorized,
  resolveMachineInsertStatus,
} from '@/lib/bots/ingest/machineWriteAuth';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { S91_DISCOVERY_ONLY_SKIP_REASON } from '@/lib/bots/ingest/runIngestCycle';

const ROOT = process.cwd();

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (
      name === 'node_modules' ||
      name === '.next' ||
      name === 'dist' ||
      name === '_wave3_reports' ||
      name === '_s9_reports'
    ) {
      continue;
    }
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Production/runtime callers allowed to invoke insertIngestedOffer. */
const INSERT_ALLOWLIST = new Set([
  'lib/bots/ingest/insertIngestedOffer.ts',
  'lib/supply/s7Bridge/writePendingViaS7Bridge.ts',
  'lib/bots/ingest/externalWorker.ts',
  // re-exports / type-only mentions OK if no call — still listed if import present
  'lib/bots/ingest/index.ts',
  'lib/hunter/modules.ts',
  'lib/hunter/metricUniverses.ts',
  'lib/supply/intelligence/observeOpportunity.ts',
]);

describe('S9.1 machine write authorization', () => {
  const prevWrites = process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  const prevVercel = process.env.VERCEL_ENV;
  const prevNode = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    process.env.VERCEL_ENV = 'development';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    if (prevWrites === undefined) delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    else process.env.BOT_INGEST_MACHINE_PENDING_WRITES = prevWrites;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it('blocks machine write when gate OFF', () => {
    expect(isMachinePendingWriteEnabled()).toBe(false);
    const auth = assertMachineOfferWriteAuthorized();
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.code).toBe('MACHINE_WRITES_DISABLED');
  });

  it('allows machine write inside withMachinePendingWritesEnabled', async () => {
    const inside = await withMachinePendingWritesEnabled(async () => {
      expect(isMachinePendingWriteEnabled()).toBe(true);
      return assertMachineOfferWriteAuthorized();
    });
    expect(inside.ok).toBe(true);
    expect(isMachinePendingWriteEnabled()).toBe(false);
  });

  it('production fail-closed even if writes env ON', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.BOT_INGEST_MACHINE_PENDING_WRITES = 'true';
    const auth = assertMachineOfferWriteAuthorized();
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.code).toBe('PRODUCTION_BLOCKED');
  });

  it('auto-approve decision does not change insert status authorization', () => {
    expect(resolveMachineInsertStatus('approved')).toBe('pending');
    expect(resolveMachineInsertStatus('pending')).toBe('pending');
    process.env.BOT_INGEST_AUTO_APPROVE = 'true';
    expect(resolveMachineInsertStatus('approved')).toBe('pending');
  });
});

describe('S9.1 legacy cron discovery-only', () => {
  it('runIngestCycle source has no insertIngestedOffer call', () => {
    const src = readFileSync(join(ROOT, 'lib/bots/ingest/runIngestCycle.ts'), 'utf8');
    expect(src).not.toMatch(/insertIngestedOffer\s*\(/);
    expect(src).not.toMatch(/from ['\"]\.\/insertIngestedOffer['\"]/);
    expect(src).toMatch(/S91_DISCOVERY_ONLY_SKIP_REASON/);
    expect(src).toMatch(/discovery_only/);
  });

  it('exports discovery skip reason', () => {
    expect(S91_DISCOVERY_ONLY_SKIP_REASON).toBe('s91_discovery_only_use_s9_for_writes');
  });
});

describe('S9.1 insertIngestedOffer caller allowlist regression', () => {
  it('fails if a new production caller appears outside the allowlist', () => {
    const files = [
      ...walkTsFiles(join(ROOT, 'lib')),
      ...walkTsFiles(join(ROOT, 'app')),
    ];
    const offenders: string[] = [];
    const callRe = /insertIngestedOffer\s*\(/;
    const importRe = /from\s+['\"][^'\"]*insertIngestedOffer['\"]/;

    for (const abs of files) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      if (rel.startsWith('tests/')) continue;
      const text = readFileSync(abs, 'utf8');
      if (!callRe.test(text) && !importRe.test(text)) continue;
      // Allow definition file itself
      if (rel === 'lib/bots/ingest/insertIngestedOffer.ts') continue;
      if (INSERT_ALLOWLIST.has(rel)) {
        // Allowlisted files may import; runIngestCycle must not call
        if (rel.includes('runIngestCycle') && callRe.test(text)) {
          offenders.push(rel);
        }
        continue;
      }
      if (callRe.test(text) || importRe.test(text)) {
        offenders.push(rel);
      }
    }

    expect(offenders, `Unexpected insertIngestedOffer callers: ${offenders.join(', ')}`).toEqual(
      [],
    );
  });

  it('canonical S9 path uses bridge + gate', () => {
    const bridge = readFileSync(
      join(ROOT, 'lib/supply/s7Bridge/writePendingViaS7Bridge.ts'),
      'utf8',
    );
    const auto = readFileSync(
      join(ROOT, 'lib/supply/automation/runSupplyAutomation.ts'),
      'utf8',
    );
    expect(bridge).toMatch(/isMachinePendingWriteEnabled/);
    expect(bridge).toMatch(/insertIngestedOffer/);
    expect(auto).toMatch(/withMachinePendingWritesEnabled/);
    expect(auto).toMatch(/writePendingViaS7Bridge/);
  });

  it('money / distribution / attribution modules do not call insertIngestedOffer', () => {
    for (const dir of ['lib/economy', 'lib/distribution', 'lib/attribution', 'lib/rewards']) {
      const files = walkTsFiles(join(ROOT, dir));
      for (const abs of files) {
        const text = readFileSync(abs, 'utf8');
        expect(text).not.toMatch(/insertIngestedOffer/);
      }
    }
  });
});

describe('S9.1 insertIngestedOffer defense-in-depth (mocked supabase)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
    process.env.VERCEL_ENV = 'development';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BOT_INGEST_MACHINE_PENDING_WRITES;
  });

  it('S9 without machine gate → blocked at insert', async () => {
    const { insertIngestedOffer } = await import('@/lib/bots/ingest/insertIngestedOffer');
    const result = await insertIngestedOffer(
      {
        canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-s91',
        title: 'S91 test',
        store: 'Mercado Libre',
        imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_x.jpg',
        discountPrice: 100,
        originalPrice: 200,
        discountPercent: 50,
        signals: {},
      },
      {
        botUserId: '00000000-0000-4000-8000-000000000001',
        botUserIdsForQuota: ['00000000-0000-4000-8000-000000000001'],
      } as never,
      { status: 'pending' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok && 'error' in result) {
      expect(result.error).toMatch(/MACHINE_PENDING_WRITES|machine_writes/i);
    }
  });

  it('requested approved status is coerced to pending authorization model', () => {
    expect(resolveMachineInsertStatus('approved')).toBe('pending');
  });
});
