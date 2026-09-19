/**
 * CazaOfertasss — FASE 1. Staging integration (opcional).
 *
 * Corre contra staging SOLO si:
 *   - NEXT_PUBLIC_SUPABASE_URL apunta a staging
 *   - las tablas caza_* ya existen
 *   - CAZA_STAGING_PERSISTENCE=1
 *
 * Nunca toca producción. Nunca escribe money path de Aventa.
 */

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import {
  assertCazaOfertasMoneyUntouched,
  buildAffiliateRevenueEvent,
  buildDealCandidate,
  createPostgresDealCandidateRepository,
  createPostgresPublicationRepository,
  createPostgresRevenueRepository,
  dealCandidateToRow,
  type CazaSupabaseClient,
} from '@/lib/cazaOfertas';
import {
  CAZA_DEAL_CANDIDATES_TABLE,
  CAZA_FORBIDDEN_AVENTA_MONEY_TABLES,
  CAZA_PUBLICATIONS_TABLE,
  CAZA_REVENUE_EVENTS_TABLE,
  CAZA_UPSERT_THEN_FAIL_RPC,
} from '@/lib/cazaOfertas/persistence/tables';
import { STAGING_SUPABASE_REF, assertStagingSupabaseUrl } from '@/lib/supabase/projectRefs';

import {
  NOW,
  NOW_ISO,
  amazonAffiliate,
  amazonDraft,
  buildTestPublicationRecord,
  strongEvidence,
} from './fixtures';

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

loadEnv('.env.local');

const enabled = process.env.CAZA_STAGING_PERSISTENCE === '1';
const describeStaging = enabled ? describe : describe.skip;

describeStaging('FASE 1 staging persistence', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

  it('refuse production + money untouched', () => {
    assertStagingSupabaseUrl(url);
    expect(url).toContain(STAGING_SUPABASE_REF);
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
    for (const table of CAZA_FORBIDDEN_AVENTA_MONEY_TABLES) {
      expect(table.startsWith('caza_')).toBe(false);
    }
  });

  it('tables exist and support insert/upsert/concurrent/idempotent/append/rollback/RLS', async () => {
    assertStagingSupabaseUrl(url);
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as CazaSupabaseClient;

    // Probe tables
    for (const table of [
      CAZA_DEAL_CANDIDATES_TABLE,
      CAZA_PUBLICATIONS_TABLE,
      CAZA_REVENUE_EVENTS_TABLE,
    ]) {
      const { error } = await service.from(table).select('*').limit(1);
      if (error && /does not exist|Could not find the table/i.test(error.message)) {
        throw new Error(
          `STAGING DDL missing for ${table}. Apply docs/supabase-migrations/20260919_cazaofertas_persistence.sql to staging only.`
        );
      }
      if (error) throw new Error(error.message);
    }

    const stamp = Date.now();
    const draft = amazonDraft({
      title: `Caza FASE1 staging ${stamp}`,
      currentPrice: 1999,
      evidence: strongEvidence({ currentPrice: 1999 }),
    });
    // Unique ASIN-like id per run to avoid colliding with prior canaries.
    const uniqueAsin = `B0CAZA${String(stamp).slice(-6)}`.slice(0, 10).toUpperCase();
    draft.url = `https://www.amazon.com.mx/dp/${uniqueAsin}`;
    const built = buildDealCandidate(draft, {
      now: NOW,
      affiliate: amazonAffiliate({
        affiliateUrl: `https://www.amazon.com.mx/dp/${uniqueAsin}?tag=cazaofertasss-20`,
      }),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const candidates = createPostgresDealCandidateRepository(service);
    const created = await candidates.upsertAtomic(built.value);
    expect(created.action).toBe('created');

    const cheaper = buildDealCandidate(
      {
        ...draft,
        currentPrice: 1799,
        evidence: strongEvidence({ currentPrice: 1799 }),
      },
      {
        now: NOW,
        affiliate: amazonAffiliate({
          affiliateUrl: `https://www.amazon.com.mx/dp/${uniqueAsin}?tag=cazaofertasss-20`,
        }),
      }
    );
    if (!cheaper.ok) throw new Error('fixture');

    const concurrent = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const price = 1780 - i;
        const c = buildDealCandidate(
          {
            ...draft,
            currentPrice: price,
            evidence: strongEvidence({ currentPrice: price }),
          },
          {
            now: NOW,
            affiliate: amazonAffiliate({
              affiliateUrl: `https://www.amazon.com.mx/dp/${uniqueAsin}?tag=cazaofertasss-20`,
            }),
          }
        );
        if (!c.ok) throw new Error('fixture');
        return candidates.upsertAtomic(c.value);
      })
    );
    expect(new Set(concurrent.map((r) => r.candidate.identity.key)).size).toBe(1);

    const found = await candidates.findByIdentityKey(built.value.identity.key);
    expect(found?.revision).toBeGreaterThanOrEqual(2);

    // Publication idempotency
    const pubs = createPostgresPublicationRepository(service);
    const pub = buildTestPublicationRecord({
      dealId: built.value.id,
      store: 'amazon_mx',
      affiliateNetwork: 'amazon_associates_mx',
      trackingLabel: `caza_${String(stamp).slice(-8)}_20260919`,
      telegramChannel: '@cazaofertasss',
      preparedAt: NOW_ISO,
      affiliateUrl: `https://www.amazon.com.mx/dp/${uniqueAsin}?tag=cazaofertasss-20`,
      publishedRevision: built.value.revision,
    });
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    const pubResults = await Promise.all(
      Array.from({ length: 5 }, () => pubs.saveIdempotent(pub.value))
    );
    expect(pubResults.filter((r) => r.inserted)).toHaveLength(1);

    // Revenue append + duplicate
    const ledger = createPostgresRevenueRepository(service);
    const event = buildAffiliateRevenueEvent({
      network: 'amazon_associates_mx',
      externalReference: `ORDER-CAZA-${stamp}`,
      dealId: built.value.id,
      trackingLabel: `caza_${String(stamp).slice(-8)}_20260919`,
      eventType: 'COMMISSION',
      amountValue: 12.5,
      currency: 'MXN',
      occurredAt: NOW_ISO,
      status: 'PENDING',
      recordedAt: NOW_ISO,
    });
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    expect(await ledger.append(event.value)).toEqual({ appended: true, duplicate: false });
    expect(await ledger.append(event.value)).toEqual({ appended: false, duplicate: true });

    // Rollback helper — valid row payload; PL/pgSQL RAISE aborts the whole txn.
    const beforeRollback = await candidates.findByIdentityKey(built.value.identity.key);
    const failCandidate = buildDealCandidate(
      {
        ...draft,
        currentPrice: 1.5,
        evidence: strongEvidence({ currentPrice: 1.5 }),
      },
      {
        now: NOW,
        affiliate: amazonAffiliate({
          affiliateUrl: `https://www.amazon.com.mx/dp/${uniqueAsin}?tag=cazaofertasss-20`,
        }),
      }
    );
    expect(failCandidate.ok).toBe(true);
    if (!failCandidate.ok) return;
    const failPayload = dealCandidateToRow(failCandidate.value);
    const { error: failErr } = await service.rpc(CAZA_UPSERT_THEN_FAIL_RPC, {
      p_row: failPayload,
    });
    expect(failErr?.message).toMatch(/caza_forced_rollback/);
    const afterRollback = await candidates.findByIdentityKey(built.value.identity.key);
    expect(afterRollback?.revision).toBe(beforeRollback?.revision);
    expect(afterRollback?.currentPrice).toBe(beforeRollback?.currentPrice);

    // J unauthorized: anon cannot read revenue
    if (anonKey) {
      const anon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await anon.from(CAZA_REVENUE_EVENTS_TABLE).select('*').limit(1);
      expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true);
      // RLS deny typically surfaces as empty or permission error — both acceptable.
      if (error) {
        expect(error.message.length).toBeGreaterThan(0);
      }
    }
  }, 60_000);
});
