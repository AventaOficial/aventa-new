/**
 * Liberación de identidades caducadas contra PostgreSQL real (Supabase local desechable).
 * Datos sintéticos. Nunca corre contra staging ni production (`assertIsolated`).
 *
 * Reproduce el defecto de Ariel / McCormick / KleenBebé: un ítem APPROVED cuya oferta fue
 * rechazada en moderación seguía ocupando offer_batch_items_open_identity_uidx y el reenvío
 * respondía ALREADY_IN_REVIEW. Recorre el flujo real: submitDealCandidates → createOfferBatch →
 * enqueueHunterOffer → writer. Solo se sustituye la descarga de la ficha (extractOfferFromUrl).
 *
 * Mismo arranque que tests/offers/ingestConcurrency.pg.integration.test.ts; el workflow
 * .github/workflows/pg-concurrency.yml corre ambas con las migraciones reales.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/offers/offerExtraction/extractOfferFromUrl', () => ({
  extractOfferFromUrl: vi.fn(async (url: string) => ({
    httpStatus: 200,
    body: {
      title: `Toallitas húmedas QA 80 pz ${new URL(url).pathname.split('/')[1]}`,
      image: 'https://www.soriana.com/img/qa.jpg',
      images: ['https://www.soriana.com/img/qa.jpg'],
      store: 'Soriana',
      suggested_discount_price: 59,
      suggested_original_price: 79,
      suggested_category: 'Despensa',
      reason: null,
      extraction_status: 'success',
      missing: [],
      diagnostics: { accessFailure: null, extractionErrorCode: null },
    },
    adapter: { provider: 'soriana', blockedByHostPolicy: false, priceSource: 'retail_html', originalPriceSource: 'retail_html' },
    core: { provider: 'soriana' },
  })),
}));

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MachineClientContext } from '@/lib/mcp/auth';
import { checkOfferExists } from '@/lib/mcp/catalog';
import { submitDealCandidates } from '@/lib/mcp/submissions';
import { generateMachineToken } from '@/lib/mcp/tokens';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste/extractOfferUrls';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';

const URL_ENV = process.env.ISOLATED_SUPABASE_URL ?? '';
const KEY_ENV = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.AVENTA_ISOLATED_PG_TEST === '1' && Boolean(URL_ENV && KEY_ENV);

describe.runIf(process.env.AVENTA_REQUIRE_PG_TEST === '1')('configuración de la prueba aislada (liberación)', () => {
  it('tiene URL y llave del Supabase local', () => {
    expect(enabled).toBe(true);
  });
});

function assertIsolated(url: string): void {
  const host = new URL(url).hostname;
  if (url.includes(PRODUCTION_SUPABASE_REF) || url.includes(STAGING_SUPABASE_REF)) {
    throw new Error('Prueba destructiva: prohibido contra production o staging.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Prueba destructiva: solo Supabase local (host recibido: ${host}).`);
  }
}

const RUN = `pgrel-${Date.now()}`;
const ACTIVE = ['pending', 'approved', 'published'];
const OPEN = ['INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR', 'APPROVED'];
let seq = 0;

function productUrl(slug: string): string {
  return `https://www.soriana.com/${RUN}-${slug}/11${Math.floor(1e5 + Math.random() * 8e5)}.html`;
}

type Q = { then: Promise<{ data: null; error: { code: string; message: string } }>['then'] } & Record<string, unknown>;
function failedQuery(): Q {
  const result = Promise.resolve({ data: null, error: { code: 'XX000', message: 'falla inyectada' } });
  const q = { then: result.then.bind(result) } as Q;
  for (const m of ['eq', 'neq', 'in', 'is', 'lte', 'gte', 'select', 'limit', 'order', 'maybeSingle', 'single']) q[m] = () => q;
  return q;
}

/** Cliente real cuyo `op` sobre `table` devuelve un error de base. El resto va a Postgres. */
function withFailure(client: SupabaseClient, table: string, op: 'update' | 'select'): SupabaseClient {
  return new Proxy(client, {
    get(target, prop) {
      if (prop !== 'from') {
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return (name: string) => {
        const builder = target.from(name);
        if (name !== table) return builder;
        return new Proxy(builder, {
          get(b, p) {
            if (p === op) return () => failedQuery();
            const v = Reflect.get(b, p);
            return typeof v === 'function' ? v.bind(b) : v;
          },
        });
      };
    },
  });
}

describe.skipIf(!enabled)('PostgreSQL aislado: un retenedor caducado no bloquea; uno activo sí', () => {
  let supabase: SupabaseClient;
  let authorId: string;
  let client: MachineClientContext;
  const prevIngest = process.env.MCP_INGEST_ENABLED;

  function submit(url: string, key = `${RUN}-k${++seq}`, runId = `${RUN}-r${seq}`, db: SupabaseClient = supabase) {
    return submitDealCandidates(db, client, {
      runId,
      idempotencyKey: key,
      candidates: [{ url, title: 'Toallitas húmedas QA 80 pz', price: 59, originalPrice: 79, currency: 'MXN', observedAt: new Date().toISOString() }],
    });
  }

  async function itemsFor(url: string) {
    const { data, error } = await supabase
      .from('offer_batch_items')
      .select('id, status, offer_id, rejection_reason, rejected_at, error_code')
      .eq('identity_key', offerBatchIdentityKey(url))
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async function activeOffers(url: string) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, status')
      .eq('ingestion_identity_key', resolveIngestionIdentity(url).key!)
      .in('status', ACTIVE)
      .is('deleted_at', null);
    if (error) throw error;
    return data ?? [];
  }

  async function moderate(offerId: string, status: 'rejected' | 'approved') {
    const { error } = await supabase.from('offers').update({ status }).eq('id', offerId);
    if (error) throw error;
  }

  /** Paso 1-2 del defecto: el intake aceptó la oferta y moderación la rechazó después. */
  async function staleHolder(slug: string) {
    const url = productUrl(slug);
    const first = await submit(url);
    if (!first.ok) throw new Error(`setup: ${first.code}`);
    expect(first.data.accepted).toEqual([{ index: 0 }]);
    const [item] = await itemsFor(url);
    expect(item).toMatchObject({ status: 'APPROVED' });
    await moderate(item.offer_id as string, 'rejected');
    return { url, oldItemId: item.id as string, oldOfferId: item.offer_id as string };
  }

  beforeAll(async () => {
    assertIsolated(URL_ENV);
    process.env.MCP_INGEST_ENABLED = 'true';
    supabase = createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.admin.createUser({ email: `${RUN}@example.test`, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('no user');
    authorId = data.user.id;
    const profile = await supabase.from('profiles').upsert({ id: authorId, display_name: `QA ${RUN}` });
    if (profile.error) throw profile.error;
    const token = generateMachineToken();
    const { data: mc, error: mcError } = await supabase
      .from('machine_clients')
      .insert({
        name: `QA ${RUN}`.slice(0, 80),
        token_prefix: token.prefix,
        token_hash: token.hash,
        scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
        status: 'active',
        author_profile_id: authorId,
        daily_candidate_cap: 1000,
        created_by: authorId,
      })
      .select('id')
      .single();
    if (mcError || !mc) throw mcError ?? new Error('no machine client');
    client = {
      id: (mc as { id: string }).id,
      name: 'QA',
      scopes: ['candidates:submit', 'candidates:read', 'catalog:read'],
      status: 'active',
      authorProfileId: authorId,
      dailyCandidateCap: 1000,
    };
  });

  afterAll(async () => {
    if (prevIngest === undefined) delete process.env.MCP_INGEST_ENABLED;
    else process.env.MCP_INGEST_ENABLED = prevIngest;
    if (!supabase) return;
    if (authorId) await supabase.from('offer_batches').delete().eq('created_by', authorId);
    await supabase.from('offers').delete().like('offer_url', `%${RUN}%`);
    if (client) await supabase.from('machine_clients').delete().eq('id', client.id);
    if (authorId) {
      await supabase.from('profiles').delete().eq('id', authorId);
      await supabase.auth.admin.deleteUser(authorId);
    }
  });

  it('el índice de identidad abierta existe: dos ítems abiertos con la misma clave fallan con 23505', async () => {
    const { url, oldItemId } = await staleHolder('index');
    const { data: old } = await supabase.from('offer_batch_items').select('batch_id, position, source_url').eq('id', oldItemId).single();
    const dup = await supabase.from('offer_batch_items').insert({
      batch_id: (await supabase.from('offer_batches').insert({ name: `QA ${RUN}`, created_by: authorId }).select('id').single()).data!.id,
      position: 0,
      status: 'INGESTED',
      identity_key: offerBatchIdentityKey(url),
      source_url: (old as { source_url: string }).source_url,
    });
    expect(dup.error?.code).toBe('23505');
  });

  it('defecto histórico: tras el rechazo, check lo da por enviable y submit lo acepta liberando el ítem viejo', async () => {
    const { url, oldItemId, oldOfferId } = await staleHolder('history');

    expect(await checkOfferExists(supabase, url)).toEqual({
      ok: true,
      data: { exists: false, status: 'none', matchedBy: null, canSubmit: true, previouslyRejected: true },
    });

    const key = `${RUN}-history-retry`;
    const runId = `${RUN}-history-run`;
    const r = await submit(url, key, runId);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.data.rejected).toEqual([]);
    expect(r.data.accepted).toEqual([{ index: 0 }]);

    const items = await itemsFor(url);
    const old = items.find((i) => i.id === oldItemId);
    expect(old).toMatchObject({ status: 'REJECTED', rejection_reason: 'offer_no_longer_active', offer_id: oldOfferId });
    expect(old?.rejected_at).toBeTruthy();
    const open = items.filter((i) => OPEN.includes(i.status as string));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ status: 'APPROVED' });
    expect(open[0].offer_id).not.toBe(oldOfferId);

    const active = await activeOffers(url);
    expect(active).toEqual([{ id: open[0].offer_id, status: 'pending' }]);
    const { data: oldOffer } = await supabase.from('offers').select('status').eq('id', oldOfferId).single();
    expect(oldOffer?.status).toBe('rejected');

    // Reintento idempotente: misma llave y payload => misma respuesta, sin filas nuevas.
    const before = { items: (await itemsFor(url)).length, offers: (await activeOffers(url)).length };
    const replay = await submit(url, key, runId);
    expect(replay.ok && replay.replay).toBe(true);
    expect(replay.ok && replay.data).toEqual(r.data);
    expect((await itemsFor(url)).length).toBe(before.items);
    expect((await activeOffers(url)).length).toBe(before.offers);
  });

  it('una oferta realmente activa sigue bloqueando: pending y después approved', async () => {
    const { url } = await staleHolder('active');
    const accepted = await submit(url);
    expect(accepted.ok && accepted.data.accepted).toEqual([{ index: 0 }]);
    const [live] = (await itemsFor(url)).filter((i) => i.status === 'APPROVED');

    expect(await checkOfferExists(supabase, url)).toMatchObject({ ok: true, data: { status: 'in_review', canSubmit: false } });
    const whilePending = await submit(url);
    expect(whilePending.ok && whilePending.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);

    await moderate(live.offer_id as string, 'approved');
    expect(await checkOfferExists(supabase, url)).toMatchObject({ ok: true, data: { canSubmit: false } });
    const whileApproved = await submit(url);
    expect(whileApproved.ok && whileApproved.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);

    const after = await itemsFor(url);
    expect(after.find((i) => i.id === live.id)).toMatchObject({ status: 'APPROVED', rejection_reason: null });
    expect(after.filter((i) => OPEN.includes(i.status as string))).toHaveLength(1);
    expect(await activeOffers(url)).toHaveLength(1);
  });

  it('envíos simultáneos sobre un retenedor caducado: un solo candidato nuevo en moderación', async () => {
    const { url, oldItemId } = await staleHolder('race');
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(url)));
    const accepted = results.filter((r) => r.ok && r.data.accepted.length === 1);
    const inReview = results.filter((r) => r.ok && r.data.rejected.some((x) => x.code === 'ALREADY_IN_REVIEW'));
    expect(accepted).toHaveLength(1);
    expect(inReview).toHaveLength(results.length - 1);

    const items = await itemsFor(url);
    expect(items.find((i) => i.id === oldItemId)).toMatchObject({ status: 'REJECTED', rejection_reason: 'offer_no_longer_active' });
    expect(items.filter((i) => OPEN.includes(i.status as string))).toHaveLength(1);
    expect(await activeOffers(url)).toHaveLength(1);
  });

  it('si la liberación falla en la base, el envío no se da por aceptado y nada cambia', async () => {
    const { url, oldItemId } = await staleHolder('fail-update');
    const r = await submit(url, undefined, undefined, withFailure(supabase, 'offer_batch_items', 'update'));
    expect(r.ok && r.data.accepted).toEqual([]);
    expect(r.ok && r.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
    const items = await itemsFor(url);
    expect(items.find((i) => i.id === oldItemId)).toMatchObject({ status: 'APPROVED', rejection_reason: null });
    expect(items).toHaveLength(1);
    expect(await activeOffers(url)).toHaveLength(0);
  });

  it('si la lectura de la oferta retenida falla, tampoco hay éxito silencioso', async () => {
    const { url, oldItemId } = await staleHolder('fail-read');
    const r = await submit(url, undefined, undefined, withFailure(supabase, 'offers', 'select'));
    if (r.ok) {
      expect(r.data.accepted).toEqual([]);
      expect(r.data.rejected).toEqual([{ index: 0, code: 'ALREADY_IN_REVIEW' }]);
    } else {
      expect(r.code).toBe('INTERNAL_ERROR');
    }
    expect((await itemsFor(url)).find((i) => i.id === oldItemId)).toMatchObject({ status: 'APPROVED', rejection_reason: null });
    expect(await activeOffers(url)).toHaveLength(0);
    expect(await checkOfferExists(withFailure(supabase, 'offers', 'select'), url)).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
  });
});
