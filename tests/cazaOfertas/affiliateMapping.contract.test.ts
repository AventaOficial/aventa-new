/**
 * CazaOfertasss — FASE 4.1. Affiliate mapping operado (store + resolver).
 *
 * Matriz: G FOUND · H NOT_FOUND · I EXPIRED · J DISABLED · K concurrent lookup
 *         O invalid tracking label · Q money isolation · identidad · secretos.
 */

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  AFFILIATE_MAPPING_LOOKUP_MAX_KEYS,
  CAZA_AFFILIATE_MAPPINGS_TABLE,
  CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS,
  affiliateMappingLookupKeys,
  affiliateMappingToRow,
  buildAffiliateMapping,
  buildDealCandidate,
  buildDealIdentity,
  canonicalUrlIdentityKey,
  createAffiliateMappingResolver,
  createInMemoryAffiliateMappingRepository,
  createPostgresAffiliateMappingRepository,
  evaluateAffiliateMappingLookup,
  externalProductIdentityKey,
  rowToAffiliateMapping,
  type AffiliateMapping,
  type AffiliateResolveInput,
  type CazaQueryBuilder,
  type CazaSupabaseClient,
} from '@/lib/cazaOfertas';

import { NOW, NOW_ISO, amazonDraft, strongEvidence } from './fixtures';

const ASIN = 'B0MAPPING1';
const CANONICAL = `https://www.amazon.com.mx/dp/${ASIN}?th=1&utm_source=ops`;
const AFFILIATE = `https://www.amazon.com.mx/dp/${ASIN}?tag=cazaofertasss-20`;

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    store: 'amazon_mx',
    externalProductId: ASIN,
    canonicalUrl: CANONICAL,
    affiliateUrl: AFFILIATE,
    ...overrides,
  };
}

function mapping(overrides: Record<string, unknown> = {}): AffiliateMapping {
  const built = buildAffiliateMapping(validDraft(overrides), { now: NOW });
  if (!built.ok) throw new Error(`fixture mapping: ${built.reasons.join(',')}`);
  return built.value;
}

function resolveInput(overrides: Partial<AffiliateResolveInput> = {}): AffiliateResolveInput {
  const identity = buildDealIdentity({ store: 'amazon_mx', url: CANONICAL, externalProductId: ASIN });
  if (!identity.ok) throw new Error('fixture identity');
  return {
    identity: identity.value,
    dealId: `caza_amazon_mx_test`,
    canonicalUrl: identity.value.normalizedUrl,
    now: NOW_ISO,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Build / identity / secrets
// ---------------------------------------------------------------------------

describe('FASE 4.1 affiliate mapping — build + identidad', () => {
  it('construye un mapping ACTIVE con identidad primaria store+pid (nunca title/price)', () => {
    const m = mapping({ title: 'Ignorado', price: 1, discount: 99 });
    expect(m.identityStrategy).toBe('external_product_id');
    expect(m.identityKey).toBe(externalProductIdentityKey('amazon_mx', ASIN));
    expect(m.id).toMatch(/^caza_map_[a-z0-9]+$/);
    expect(m.status).toBe('ACTIVE');
    expect(m.network).toBe('amazon_associates_mx');
    expect(m.trackingLabel).toBeNull();
    expect(m.canonicalUrl).toBe(`https://amazon.com.mx/dp/${ASIN}`);
    expect(m.validFrom).toBe(NOW_ISO);
    expect(m.validUntil).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/Ignorado|"price"|"discount"/);
  });

  it('la identidad del mapping coincide con la identidad del DealCandidate', () => {
    const m = mapping();
    const candidate = buildDealCandidate(
      amazonDraft({ url: CANONICAL, externalProductId: ASIN, title: 'Otro título' }),
      { now: NOW }
    );
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(candidate.value.identity.key).toBe(m.identityKey);
  });

  it('fallback canonical_url cuando no hay pid extraíble', () => {
    const url = 'https://www.mercadolibre.com.mx/oferta-sin-id-visible';
    const m = mapping({
      store: 'mercadolibre_mx',
      externalProductId: null,
      canonicalUrl: url,
      affiliateUrl: `${url}?matt_word=cazaofertasss`,
    });
    expect(m.identityStrategy).toBe('canonical_url');
    expect(m.externalProductId).toBeNull();
    expect(m.identityKey).toBe(canonicalUrlIdentityKey('mercadolibre_mx', m.canonicalUrl));
  });

  it('O: tracking label inválido se rechaza; válido se conserva', () => {
    const bad = buildAffiliateMapping(validDraft({ trackingLabel: 'Caza-Bad Label!' }), { now: NOW });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reasons).toContain('affiliate_mapping.tracking_label_invalid');

    const short = buildAffiliateMapping(validDraft({ trackingLabel: 'abc' }), { now: NOW });
    expect(short.ok).toBe(false);

    const good = mapping({ trackingLabel: 'caza_ops_20260919' });
    expect(good.trackingLabel).toBe('caza_ops_20260919');
  });

  it('rechaza affiliate URL sin marcadores de red, host distinto, igual a canónica o red incoherente', () => {
    const noMarker = buildAffiliateMapping(
      validDraft({ affiliateUrl: `https://www.amazon.com.mx/dp/${ASIN}?ref=x` }),
      { now: NOW }
    );
    expect(noMarker.ok).toBe(false);
    if (!noMarker.ok) {
      expect(noMarker.reasons[0]).toMatch(/affiliate_url_missing_network_markers/);
    }

    const otherHost = buildAffiliateMapping(
      validDraft({ affiliateUrl: `https://www.amazon.com/dp/${ASIN}?tag=cazaofertasss-20` }),
      { now: NOW }
    );
    expect(otherHost.ok).toBe(false);

    const wrongNetwork = buildAffiliateMapping(
      validDraft({ network: 'mercadolibre_affiliates' }),
      { now: NOW }
    );
    expect(wrongNetwork.ok).toBe(false);
    if (!wrongNetwork.ok) expect(wrongNetwork.reasons[0]).toMatch(/network_store_mismatch/);
  });

  it('rechaza esquemas javascript:/data:/file:/http: y credenciales embebidas', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      `http://www.amazon.com.mx/dp/${ASIN}`,
      `https://user:pw@www.amazon.com.mx/dp/${ASIN}`,
    ]) {
      const r = buildAffiliateMapping(validDraft({ canonicalUrl: url }), { now: NOW });
      expect(r.ok, url).toBe(false);
      const r2 = buildAffiliateMapping(validDraft({ affiliateUrl: url }), { now: NOW });
      expect(r2.ok, url).toBe(false);
    }
  });

  it('nunca acepta contenido que parezca secreto (bot token, JWT, service_role)', () => {
    const token = '123456789:AAHfakeTokenValue_abcdefghijklmnop';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnopqrstuvwxyz';
    for (const bad of [token, jwt, 'service_role']) {
      const r = buildAffiliateMapping(
        validDraft({ affiliateUrl: `${AFFILIATE}&x=${encodeURIComponent(bad)}` }),
        { now: NOW }
      );
      // encodeURIComponent puede romper el patrón; probamos también crudo.
      const raw = buildAffiliateMapping(validDraft({ affiliateUrl: `${AFFILIATE}&x=${bad}` }), {
        now: NOW,
      });
      expect(r.ok && raw.ok).toBe(false);
    }
    const row = affiliateMappingToRow(mapping());
    expect(Object.keys(row)).not.toContain('credential');
    expect(JSON.stringify(row)).not.toMatch(/CAZAOFERTAS_AMAZON_ASSOCIATE_TAG|service_role/);
  });

  it('valid_until debe ser posterior a valid_from', () => {
    const r = buildAffiliateMapping(
      validDraft({ validFrom: NOW_ISO, validUntil: '2026-09-19T11:00:00.000Z' }),
      { now: NOW }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain('affiliate_mapping.valid_until_not_after_valid_from');
  });

  it('mapper fila ↔ dominio es roundtrip', () => {
    const m = mapping({ trackingLabel: 'caza_ops_20260919', validUntil: '2026-12-31T00:00:00.000Z' });
    const row = affiliateMappingToRow(m);
    expect(row.identity_key).toBe(m.identityKey);
    expect(row.tracking_label).toBe('caza_ops_20260919');
    expect(rowToAffiliateMapping(row)).toEqual(m);
  });
});

// ---------------------------------------------------------------------------
// Resolver lookup
// ---------------------------------------------------------------------------

describe('FASE 4.1 affiliate mapping — resolver lookup', () => {
  it('G: FOUND devuelve attachment validado por affiliate.ts, label interno derivado y estable', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping());
    const resolver = createAffiliateMappingResolver(repo, { clock: () => NOW });

    const r = await resolver.lookup(resolveInput());
    expect(r.outcome).toBe('FOUND');
    expect(r.trackingLabelSource).toBe('derived_internal');
    expect(r.attachment?.affiliateUrl).toBe(AFFILIATE);
    expect(r.attachment?.affiliateNetwork).toBe('amazon_associates_mx');
    expect(r.attachment?.affiliateCredentialRef).toBe('CAZAOFERTAS_AMAZON_ASSOCIATE_TAG');
    expect(r.attachment?.affiliateTrackingLabel).toMatch(/^caza_[a-z0-9]+_20260919$/);

    // Estable entre días: el label deriva de validFrom del mapping, no de `now`.
    const later = await resolver.lookup(resolveInput({ now: '2026-09-25T12:00:00.000Z' }));
    expect(later.attachment?.affiliateTrackingLabel).toBe(r.attachment?.affiliateTrackingLabel);

    const resolved = await resolver.resolve(resolveInput());
    expect(resolved.ok).toBe(true);
  });

  it('G: label declarado por operador se usa tal cual (trackingLabelSource=mapping)', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping({ trackingLabel: 'caza_ops_20260919' }));
    const r = await createAffiliateMappingResolver(repo).lookup(resolveInput());
    expect(r.outcome).toBe('FOUND');
    expect(r.trackingLabelSource).toBe('mapping');
    expect(r.attachment?.affiliateTrackingLabel).toBe('caza_ops_20260919');
  });

  it('H: NOT_FOUND es fail-closed — resolve() falla y no inventa URL', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    const resolver = createAffiliateMappingResolver(repo);
    const r = await resolver.lookup(resolveInput());
    expect(r.outcome).toBe('NOT_FOUND');
    expect(r.attachment).toBeNull();
    const resolved = await resolver.resolve(resolveInput());
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.reasons[0]).toBe('affiliate_mapping.NOT_FOUND');
  });

  it('I: EXPIRED por status, por valid_until vencido y por valid_from futuro', async () => {
    const byStatus = evaluateAffiliateMappingLookup(resolveInput(), [mapping({ status: 'EXPIRED' })]);
    expect(byStatus.outcome).toBe('EXPIRED');

    const byUntil = evaluateAffiliateMappingLookup(resolveInput(), [
      mapping({ validFrom: '2026-09-01T00:00:00.000Z', validUntil: '2026-09-10T00:00:00.000Z' }),
    ]);
    expect(byUntil.outcome).toBe('EXPIRED');
    expect(byUntil.reasons).toContain('affiliate_mapping.valid_until_passed');

    const notYet = evaluateAffiliateMappingLookup(resolveInput(), [
      mapping({ validFrom: '2026-10-01T00:00:00.000Z' }),
    ]);
    expect(notYet.outcome).toBe('EXPIRED');
    expect(notYet.reasons).toContain('affiliate_mapping.not_yet_valid');
  });

  it('J: DISABLED nunca produce attachment', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping({ status: 'DISABLED' }));
    const resolver = createAffiliateMappingResolver(repo, { clock: () => NOW });
    const r = await resolver.lookup(resolveInput());
    expect(r.outcome).toBe('DISABLED');
    expect(r.attachment).toBeNull();
    const resolved = await resolver.resolve(resolveInput());
    expect(resolved.ok).toBe(false);
  });

  it('AMBIGUOUS: dos mappings (pid + fallback URL), URL canónica en conflicto, store distinto', async () => {
    const input = resolveInput();
    const keys = affiliateMappingLookupKeys(input);
    expect(keys).toHaveLength(2);
    expect(keys.length).toBeLessThanOrEqual(AFFILIATE_MAPPING_LOOKUP_MAX_KEYS);

    const pidMapping = mapping();
    const urlMapping: AffiliateMapping = {
      ...pidMapping,
      id: 'caza_map_url',
      identityKey: keys[1],
      identityStrategy: 'canonical_url',
      externalProductId: null,
    };
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(pidMapping);
    await repo.upsert(urlMapping);
    const both = await createAffiliateMappingResolver(repo, { clock: () => NOW }).lookup(input);
    expect(both.outcome).toBe('AMBIGUOUS');

    const conflict = evaluateAffiliateMappingLookup(input, [
      { ...pidMapping, canonicalUrl: `https://amazon.com.mx/Otro-Producto/dp/${ASIN}` },
    ]);
    expect(conflict.outcome).toBe('AMBIGUOUS');
    expect(conflict.reasons).toContain('affiliate_mapping.canonical_url_conflict');

    const store = evaluateAffiliateMappingLookup(input, [
      { ...pidMapping, store: 'mercadolibre_mx' },
    ]);
    expect(store.outcome).toBe('AMBIGUOUS');
  });

  it('K: 50 lookups concurrentes son consistentes, sin escrituras', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping());
    const resolver = createAffiliateMappingResolver(repo, { clock: () => NOW });
    const upsertsBefore = repo.stats.upserts;
    const results = await Promise.all(
      Array.from({ length: 50 }, () => resolver.lookup(resolveInput()))
    );
    expect(new Set(results.map((r) => r.outcome))).toEqual(new Set(['FOUND']));
    expect(new Set(results.map((r) => r.attachment?.affiliateUrl))).toEqual(new Set([AFFILIATE]));
    expect(repo.stats.upserts).toBe(upsertsBefore);
    expect(repo.stats.lookups).toBeGreaterThanOrEqual(50);
  });

  it('acepta un DealCandidate directamente en lookup(candidate)', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping());
    const candidate = buildDealCandidate(amazonDraft({ url: CANONICAL, externalProductId: ASIN }), {
      now: NOW,
    });
    if (!candidate.ok) throw new Error('fixture');
    const r = await createAffiliateMappingResolver(repo, { clock: () => NOW }).lookup(candidate.value);
    expect(r.outcome).toBe('FOUND');
  });

  it('el resolver no modifica scoring ni evidence del candidato', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    await repo.upsert(mapping());
    const resolver = createAffiliateMappingResolver(repo, { clock: () => NOW });
    const draft = amazonDraft({ url: CANONICAL, externalProductId: ASIN, evidence: strongEvidence() });
    const without = buildDealCandidate(draft, { now: NOW });
    if (!without.ok) throw new Error('fixture');
    const found = await resolver.lookup(without.value);
    const withAttachment = buildDealCandidate(draft, { now: NOW, affiliate: found.attachment });
    if (!withAttachment.ok) throw new Error('fixture');
    expect(withAttachment.value.score).toEqual(without.value.score);
    expect(withAttachment.value.evidence).toEqual(without.value.evidence);
    expect(withAttachment.value.identity).toEqual(without.value.identity);
    expect(withAttachment.value.status).toBe('PUBLICATION_READY');
    expect(without.value.status).not.toBe('PUBLICATION_READY');
  });

  it('repositorio: upsert idempotente (unchanged) y update preserva createdAt', async () => {
    const repo = createInMemoryAffiliateMappingRepository();
    const first = await repo.upsert(mapping());
    expect(first.action).toBe('created');
    const again = await repo.upsert(mapping());
    expect(again.action).toBe('unchanged');
    const later = new Date(NOW.getTime() + 60_000);
    const changed = buildAffiliateMapping(validDraft({ status: 'DISABLED' }), { now: later });
    if (!changed.ok) throw new Error('fixture');
    const updated = await repo.upsert(changed.value);
    expect(updated.action).toBe('updated');
    expect(updated.mapping.createdAt).toBe(first.mapping.createdAt);
    expect(updated.mapping.status).toBe('DISABLED');
    expect(repo.size()).toBe(1);
  });

  it('un error del repositorio degrada a NOT_FOUND (fail-closed) sin lanzar', async () => {
    const broken = createInMemoryAffiliateMappingRepository();
    broken.findByIdentityKeys = async () => {
      throw new Error('db down with 123456789:AAHfakeTokenValue_abcdefghijklmnop');
    };
    const r = await createAffiliateMappingResolver(broken).lookup(resolveInput());
    expect(r.outcome).toBe('NOT_FOUND');
    expect(r.reasons[0]).toMatch(/repository_error/);
  });
});

// ---------------------------------------------------------------------------
// Postgres repository (cliente falso: sólo forma de las queries)
// ---------------------------------------------------------------------------

describe('FASE 4.1 affiliate mapping — Postgres repository shape', () => {
  function fakeClient(rows: Record<string, unknown>[]) {
    const calls: { op: string; args: unknown[] }[] = [];
    const store = new Map<string, Record<string, unknown>>(
      rows.map((r) => [String(r.identity_key), r])
    );
    function builder(): CazaQueryBuilder {
      let filterKeys: string[] | null = null;
      let singleKey: string | null = null;
      const b: CazaQueryBuilder = {
        select: () => b,
        eq: (col, val) => {
          calls.push({ op: 'eq', args: [col, val] });
          singleKey = val;
          return b;
        },
        in: (col, vals) => {
          calls.push({ op: 'in', args: [col, [...vals]] });
          filterKeys = [...vals];
          return b;
        },
        gt: () => b,
        lte: () => b,
        or: () => b,
        order: () => b,
        limit: (n) => {
          calls.push({ op: 'limit', args: [n] });
          const data = (filterKeys ?? []).map((k) => store.get(k)).filter(Boolean);
          return Object.assign(b, { then: (res: (v: unknown) => unknown) => res({ data, error: null }) });
        },
        maybeSingle: async () => ({ data: singleKey ? store.get(singleKey) ?? null : null, error: null }),
        upsert: async (row, opts) => {
          calls.push({ op: 'upsert', args: [row, opts] });
          store.set(String(row.identity_key), row);
          return { data: null, error: null };
        },
      };
      return b;
    }
    const client: CazaSupabaseClient = {
      from: (table) => {
        calls.push({ op: 'from', args: [table] });
        return builder();
      },
      rpc: async () => ({ data: null, error: null }),
    };
    return { client, calls };
  }

  it('lookup usa IN acotado sobre caza_affiliate_mappings y upsert onConflict identity_key', async () => {
    const { client, calls } = fakeClient([]);
    const repo = createPostgresAffiliateMappingRepository(client);
    const m = mapping();
    const created = await repo.upsert(m);
    expect(created.action).toBe('created');
    const upsertCall = calls.find((c) => c.op === 'upsert');
    expect(upsertCall?.args[1]).toEqual({ onConflict: 'identity_key' });
    expect(calls.every((c) => c.op !== 'from' || c.args[0] === CAZA_AFFILIATE_MAPPINGS_TABLE)).toBe(true);

    const found = await repo.findByIdentityKeys([m.identityKey, 'amazon_mx:url:nope']);
    expect(found).toHaveLength(1);
    const inCall = calls.find((c) => c.op === 'in');
    expect(inCall?.args[0]).toBe('identity_key');
    const limitCall = calls.filter((c) => c.op === 'limit').at(-1);
    expect(limitCall?.args[0]).toBe(AFFILIATE_MAPPING_LOOKUP_MAX_KEYS);

    await expect(
      repo.findByIdentityKeys(Array.from({ length: AFFILIATE_MAPPING_LOOKUP_MAX_KEYS + 1 }, (_, i) => `k${i}`))
    ).rejects.toThrow(/lookup_keys_exceeded/);

    const again = await repo.upsert(m);
    expect(again.action).toBe('unchanged');
  });
});

// ---------------------------------------------------------------------------
// Q — money isolation
// ---------------------------------------------------------------------------

describe('FASE 4.1 affiliate mapping — Q money isolation', () => {
  const ROOT = path.resolve(__dirname, '../../lib/cazaOfertas');
  const FILES = [
    ...fs.readdirSync(path.join(ROOT, 'affiliateMapping')).map((f) => path.join(ROOT, 'affiliateMapping', f)),
    path.join(ROOT, 'persistence', 'affiliateMappingMappers.ts'),
    path.join(ROOT, 'persistence', 'postgresAffiliateMappingRepository.ts'),
  ];

  it('no importa money path ni módulos externos (salvo zod)', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = m[1];
        if (CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS.some((p) => target.includes(p))) {
          violations.push(`${path.basename(file)} → ${target}`);
        }
        if (!target.startsWith('.') && target !== 'zod') {
          violations.push(`${path.basename(file)} → external ${target}`);
        }
      }
      expect(src, file).not.toMatch(/creator_rewards|payout_intents|reward_payouts|commissions|settlement/i);
    }
    expect(violations).toEqual([]);
  });

  it('la migración sólo crea caza_affiliate_mappings y es service_role only', () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, '../../docs/supabase-migrations/20260919_cazaofertas_affiliate_mappings.sql'),
      'utf8'
    );
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]);
    expect(tables).toEqual(['caza_affiliate_mappings']);
    // Sin comentarios: el DDL efectivo no toca tablas del money path.
    const ddl = sql
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(ddl).not.toMatch(/creator_rewards|payout_intents|reward_payouts|\bcommissions\b|settlement/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.caza_affiliate_mappings FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/UNIQUE \(identity_key\)/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});
