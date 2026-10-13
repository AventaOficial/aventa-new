/**
 * Deduplicación concurrente contra PostgreSQL real. Escribe datos sintéticos.
 * Solo corre contra un Supabase local y desechable; nunca contra staging ni production.
 *
 *   # en un directorio desechable fuera del repo (requiere Docker en marcha):
 *   supabase init && supabase start   # stack local aislado
 *   # aplicar docs/supabase-migrations/FOUNDATION_BASELINE_20260917.sql y después,
 *   # en orden de nombre, las migraciones fechadas 2026*.sql. Como mínimo la ruta probada usa:
 *   #   20260920_offers_hunter_comment.sql, 20260926_offer_ingestion_evidence.sql,
 *   #   20260927_offer_batches.sql, 20261006_machine_clients_mcp.sql,
 *   #   20261006_offer_source_currency.sql
 *   AVENTA_ISOLATED_PG_TEST=1 \
 *   ISOLATED_SUPABASE_URL=http://127.0.0.1:54321 \
 *   ISOLATED_SUPABASE_SERVICE_ROLE_KEY=<service_role local de `supabase status`> \
 *   npx vitest run tests/offers/ingestConcurrency.pg.integration.test.ts
 *
 * Cada llamada viaja por PostgREST en su propia conexión y transacción: la carrera la decide
 * `idx_offers_active_ingestion_identity`, no la aplicación.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { enqueueHunterOffer } from '@/lib/offers/ingestion/enqueueHunterOffer';
import { createOfferBatch } from '@/lib/offers/batch/service';
import { normalizeCandidateUrl, type ValidCandidate } from '@/lib/mcp/candidates';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste/extractOfferUrls';
import { PRODUCTION_SUPABASE_REF, STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';

const URL_ENV = process.env.ISOLATED_SUPABASE_URL ?? '';
const KEY_ENV = process.env.ISOLATED_SUPABASE_SERVICE_ROLE_KEY ?? '';
const enabled = process.env.AVENTA_ISOLATED_PG_TEST === '1' && Boolean(URL_ENV && KEY_ENV);

function assertIsolated(url: string): void {
  const host = new URL(url).hostname;
  if (url.includes(PRODUCTION_SUPABASE_REF) || url.includes(STAGING_SUPABASE_REF)) {
    throw new Error('Prueba destructiva: prohibido contra production o staging.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Prueba destructiva: solo Supabase local (host recibido: ${host}).`);
  }
}

const CONCURRENCY = 12;
const RUN = `pgconc-${Date.now()}`;
const ACTIVE = ['pending', 'approved', 'published'];

function productUrl(slug: string): string {
  return `https://www.soriana.com/${RUN}-${slug}/1166${Math.floor(Math.random() * 1e5)}.html`;
}

function body(url: string) {
  return {
    title: `Producto de prueba ${RUN}`,
    store: 'Soriana',
    price: 42,
    original_price: null,
    hasDiscount: false,
    offer_url: url,
    image_url: 'https://www.soriana.com/img/test.jpg',
    category: 'Despensa',
  };
}

describe.skipIf(!enabled)('PostgreSQL aislado: una sola oferta activa por identidad', () => {
  let supabase: SupabaseClient;
  let authorId: string;

  async function activeOffers(identityKey: string) {
    const { data, error } = await supabase
      .from('offers')
      .select('id, status')
      .eq('ingestion_identity_key', identityKey)
      .in('status', ACTIVE)
      .is('deleted_at', null);
    if (error) throw error;
    return data ?? [];
  }

  function ingest(url: string, idempotencyKey?: string) {
    return ingestOfferObservation(supabase, {
      createdBy: authorId,
      body: body(url) as Parameters<typeof ingestOfferObservation>[1]['body'],
      source: 'mcp:hunter',
      onDuplicate: 'reject',
      idempotencyKey,
      recordSubmissionCount: false,
      recordPriceSnapshot: false,
    });
  }

  function assertSingleWinner(results: Awaited<ReturnType<typeof ingest>>[]) {
    const winners = results.filter((r) => r.ok && r.created);
    expect(winners).toHaveLength(1);
    const winnerId = winners[0].ok ? winners[0].offerId : null;
    for (const r of results) {
      if (r.ok) {
        expect(r.offerId).toBe(winnerId);
        continue;
      }
      expect(r.httpStatus).toBe(409);
      expect(r.duplicate_offer_id).toBe(winnerId);
    }
    return winnerId;
  }

  beforeAll(async () => {
    assertIsolated(URL_ENV);
    supabase = createClient(URL_ENV, KEY_ENV, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.admin.createUser({
      email: `${RUN}@example.test`,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('no user');
    authorId = data.user.id;
    await supabase.from('profiles').upsert({ id: authorId, display_name: `QA ${RUN}` });
  });

  afterAll(async () => {
    if (!supabase) return;
    await supabase.from('offers').delete().like('title', `%${RUN}%`);
    if (authorId) await supabase.auth.admin.deleteUser(authorId);
  });

  it('el índice único existe: un INSERT directo con la misma clave activa falla con 23505', async () => {
    const key = `url:qa.example/${RUN}/raw`;
    const row = { title: `raw ${RUN}`, store: 'QA', price: 1, category: 'other', status: 'pending', created_by: authorId, image_url: '/placeholder.png', ingestion_identity_key: key };
    const first = await supabase.from('offers').insert([row]).select('id').single();
    expect(first.error).toBeNull();
    const second = await supabase.from('offers').insert([row]).select('id').single();
    expect(second.error?.code).toBe('23505');
    expect(await activeOffers(key)).toHaveLength(1);
  });

  it(`${CONCURRENCY} solicitudes simultáneas, misma URL canónica, llaves de idempotencia distintas`, async () => {
    const url = productUrl('same');
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => ingest(url, `${RUN}-same-${i}`)),
    );
    const winnerId = assertSingleWinner(results);
    const winner = results.find((r) => r.ok && r.created);
    const key = winner?.ok ? winner.identityKey : null;
    expect(key).toMatch(/^url:soriana\.com\//);
    expect((await activeOffers(key!)).map((o) => o.id)).toEqual([winnerId]);
  });

  it('URLs equivalentes tras normalizar (mayúsculas, www, barra final) compiten por la misma clave', async () => {
    const url = productUrl('equiv');
    const variants = [url, url.replace('www.soriana.com', 'SORIANA.com'), `${url}/`, url.replace('https://www.', 'https://')];
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => ingest(variants[i % variants.length], `${RUN}-equiv-${i}`)),
    );
    assertSingleWinner(results);
  });

  it('la misma llave de idempotencia repetida en paralelo no crea dos ofertas', async () => {
    const url = productUrl('idem');
    const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => ingest(url, `${RUN}-idem`)));
    assertSingleWinner(results);
  });

  it('oferta activa preexistente: todas las solicitudes quedan vinculadas a ella', async () => {
    const url = productUrl('pre');
    const first = await ingest(url, `${RUN}-pre-0`);
    expect(first.ok && first.created).toBe(true);
    const existingId = first.ok ? first.offerId : null;
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => ingest(url, `${RUN}-pre-${i + 1}`)),
    );
    for (const r of results) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.httpStatus).toBe(409);
        expect(r.duplicate_offer_id).toBe(existingId);
      }
    }
  });

  it('oferta previa inactiva (rechazada) no bloquea; sigue habiendo una sola activa', async () => {
    const url = productUrl('inactive');
    const first = await ingest(url, `${RUN}-inactive-0`);
    expect(first.ok && first.created).toBe(true);
    if (!first.ok) return;
    const { error } = await supabase.from('offers').update({ status: 'rejected' }).eq('id', first.offerId);
    expect(error).toBeNull();
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => ingest(url, `${RUN}-inactive-${i + 1}`)),
    );
    const winnerId = assertSingleWinner(results);
    expect(winnerId).not.toBe(first.offerId);
    expect((await activeOffers(first.identityKey!)).map((o) => o.id)).toEqual([winnerId]);
  });

  it('MCP de punta a punta: lotes concurrentes dejan un ítem en moderación y el resto vinculado como duplicado', async () => {
    const raw = productUrl('mcp');
    const checked = normalizeCandidateUrl(raw);
    if (!checked.ok) throw new Error('url');
    const identityKey = offerBatchIdentityKey(checked.url);
    const prepared = {
      pageKind: 'PRODUCT', product: true, title: `Arroz Verde Valle 1 kg ${RUN}`, imageUrl: 'https://www.soriana.com/img/a.jpg',
      imageUrls: [], store: 'Soriana', price: 42, originalPrice: null, priceSource: 'retail_html', originalPriceSource: null,
      category: 'Despensa', currency: 'MXN', retailer: 'soriana', imageFailure: null, fetched: true,
    } as unknown as PreparedMachineCandidate;
    const candidate = { index: 0, url: checked.url, identityKey, title: 'Arroz', price: 42, originalPrice: null, note: null } as unknown as ValidCandidate;

    const batches = await Promise.all(
      Array.from({ length: 4 }, () =>
        createOfferBatch({ supabase, createdBy: authorId, name: `QA ${RUN}`, text: '', urls: [{ url: checked.url, identityKey }] }),
      ),
    );
    const opened = batches.filter((b) => b.ok && b.batch && b.inserted > 0).map((b) => (b.ok ? b.batch!.id : ''));
    expect(opened.length).toBeGreaterThan(0);

    await Promise.all(
      opened.map((batchId) =>
        enqueueHunterOffer(
          supabase,
          { batchId, createdBy: authorId, machineClientId: `qa-${RUN}`, candidate },
          { prepare: async () => prepared, negativeMemory: async () => ({ suppressed: false, reason: null, fingerprint: null }), lowQualityTitle: () => false },
        ),
      ),
    );

    const { data: items } = await supabase
      .from('offer_batch_items')
      .select('status, offer_id, duplicate_status, duplicate_offer_id, error_code')
      .in('batch_id', opened);
    const approved = (items ?? []).filter((i) => i.status === 'APPROVED');
    expect(approved).toHaveLength(1);
    expect(approved[0].offer_id).toBeTruthy();
    for (const loser of (items ?? []).filter((i) => i.status !== 'APPROVED')) {
      expect(loser).toMatchObject({ status: 'REJECTED', error_code: 'DUPLICATE_OFFER', duplicate_status: 'duplicate', duplicate_offer_id: approved[0].offer_id });
      expect(loser.offer_id).toBeNull();
    }
    const { data: offer } = await supabase.from('offers').select('status').eq('id', approved[0].offer_id).single();
    expect(offer?.status).toBe('pending');
  });
});
