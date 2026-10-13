import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Ciclo de vida de las observaciones de precio sobre Postgres real en proceso (PGlite), con las
 * migraciones versionadas: base → 20261012 → 20261013 → 20261014.
 *
 * PGlite no está en package.json: se instala solo para esta verificación
 * (`npm i --no-save @electric-sql/pglite@0.3`). Sin él, la suite se omite y lo dice.
 * No se conecta a ninguna base remota.
 */

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: <T = Record<string, unknown>>(sql: string) => Promise<{ rows: T[] }>;
};

const PGLITE = '@electric-sql/pglite';
const mod = (await import(/* @vite-ignore */ PGLITE).catch(() => null)) as { PGlite: new () => Db } | null;
const MIGRATIONS = path.resolve(__dirname, '../../docs/supabase-migrations');
const sql = (f: string) => readFileSync(path.join(MIGRATIONS, f), 'utf8');

const OFFER_A = '11111111-1111-4111-8111-111111111111';
const OFFER_B = '22222222-2222-4222-8222-222222222222';
const OFFER_LEGACY = '33333333-3333-4333-8333-333333333333';
const OFFER_EMPTY = '44444444-4444-4444-8444-444444444444';

function capture(o: { key: string; offer: string; item: string; at: string; price?: number; status?: string; availability?: string }) {
  return `
    INSERT INTO public.offer_price_snapshots
      (offer_id, price, source, recorded_at, currency, source_id, external_item_id, identity_key, presentation_key, need_id,
       variant_id, scope_kind, scope_label, availability, capture_method, validation_status, validation_reasons,
       policy_version, idempotency_key, capture_run_id, provenance)
    VALUES ('${o.offer}', ${o.price ?? 34}, 'capture', '${o.at}', 'MXN', 'mercadolibre_mx', '${o.item}',
      'mercadolibre_mx:${o.item}|alimentos.arroz|blanco|mass:1000:-', 'mass:1000:-', 'alimentos.arroz', 'blanco',
      'online', 'MX', '${o.availability ?? 'in_stock'}', 'ml_official_api', '${o.status ?? 'valid'}', '{}',
      'price-observation-v2', '${o.key}', 'pc_test', '{"detail":"items_prices"}')`;
}

async function errorOf(db: Db, statement: string): Promise<{ code: string; message: string } | null> {
  try {
    await db.exec(statement);
    return null;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? '', message: err.message ?? '' };
  }
}

describe.skipIf(!mod)('observaciones de precio: ciclo de vida en Postgres (PGlite)', () => {
  let db: Db;
  const count = async (where: string) =>
    (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.offer_price_snapshots WHERE ${where}`)).rows[0].n;

  beforeAll(async () => {
    db = new mod!.PGlite();
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.offers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text,
        status text NOT NULL DEFAULT 'approved',
        deleted_at timestamptz
      );
    `);
    await db.exec(sql('offer_price_snapshots.sql'));
    await db.exec(sql('20261012_offer_price_observations.sql'));
    await db.exec(sql('20261013_offer_price_observations_product_series.sql'));
    await db.exec(sql('20261014_price_observations_lifecycle.sql'));
    await db.exec(`
      INSERT INTO public.offers (id, title) VALUES
        ('${OFFER_A}', 'Arroz blanco 1 kg'), ('${OFFER_B}', 'Arroz blanco 1 kg (otra oferta)'),
        ('${OFFER_LEGACY}', 'Frijol'), ('${OFFER_EMPTY}', 'Sin historial');
      INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('${OFFER_LEGACY}', 40, 'create');
    `);
    const days = ['2026-09-20T10:00:00Z', '2026-09-27T10:00:00Z', '2026-10-04T10:00:00Z', '2026-10-04T18:00:00Z', '2026-10-11T10:00:00Z'];
    for (const [i, at] of days.entries()) await db.exec(capture({ key: `a${i}`, offer: i < 3 ? OFFER_A : OFFER_B, item: 'MLM1', at }));
    await db.exec(capture({ key: 'inv', offer: OFFER_B, item: 'MLM1', at: '2026-10-12T10:00:00Z', status: 'invalid' }));
    await db.exec(capture({ key: 'oos', offer: OFFER_B, item: 'MLM1', at: '2026-10-12T11:00:00Z', availability: 'out_of_stock' }));
    await db.exec(capture({ key: 'b0', offer: OFFER_B, item: 'MLM2', at: '2026-10-12T09:00:00Z' }));
  });

  it('la migración es idempotente y deja la FK en RESTRICT', async () => {
    const fk = async () =>
      (
        await db.query<{ conname: string; confdeltype: string; oid: number }>(`
          SELECT c.conname, c.confdeltype, c.oid::int AS oid FROM pg_constraint c
          WHERE c.conrelid = 'public.offer_price_snapshots'::regclass AND c.confrelid = 'public.offers'::regclass`)
      ).rows;
    const before = await fk();
    expect(before).toHaveLength(1);
    expect(before[0].confdeltype).toBe('r');
    await db.exec(sql('20261014_price_observations_lifecycle.sql'));
    expect(await fk()).toEqual(before);
  });

  it('borrar físicamente una oferta con observaciones falla y no se pierde historial', async () => {
    const before = await count(`offer_id = '${OFFER_A}'`);
    expect(before).toBe(3);
    const err = await errorOf(db, `DELETE FROM public.offers WHERE id = '${OFFER_A}'`);
    expect(err?.code).toBe('23503');
    expect(await count(`offer_id = '${OFFER_A}'`)).toBe(3);
    // También dentro de un borrado masivo (como clean_offers_and_metrics_data.sql).
    expect((await errorOf(db, `DELETE FROM public.offers`))?.code).toBe('23503');
    expect(await count(`source = 'capture'`)).toBe(8);
  });

  it('archivar la oferta conserva procedencia: offer_id sigue resolviendo y no hay huérfanos', async () => {
    await db.exec(`UPDATE public.offers SET status = 'archived', deleted_at = '2026-10-12T00:00:00Z' WHERE id = '${OFFER_A}'`);
    const prov = await db.query<{ title: string; status: string; n: number }>(`
      SELECT o.title, o.status, count(*)::int AS n FROM public.offer_price_snapshots s
      JOIN public.offers o ON o.id = s.offer_id WHERE s.offer_id = '${OFFER_A}' GROUP BY o.title, o.status`);
    expect(prov.rows).toEqual([{ title: 'Arroz blanco 1 kg', status: 'archived', n: 3 }]);
    const orphans = await db.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM public.offer_price_snapshots s LEFT JOIN public.offers o ON o.id = s.offer_id WHERE o.id IS NULL`);
    expect(orphans.rows[0].n).toBe(0);
  });

  it('una captura no se borra nunca, ni filtrando por oferta', async () => {
    expect((await errorOf(db, `DELETE FROM public.offer_price_snapshots WHERE source = 'capture' AND offer_id = '${OFFER_A}'`))?.code).toBe('P0001');
    expect((await errorOf(db, `DELETE FROM public.offer_price_snapshots WHERE external_item_id = 'MLM2'`))?.code).toBe('P0001');
    expect(await count(`source = 'capture'`)).toBe(8);
  });

  it('TRUNCATE está bloqueado, directo o en cascada desde offers', async () => {
    expect((await errorOf(db, `TRUNCATE public.offer_price_snapshots`))?.code).toBe('42501');
    expect((await errorOf(db, `TRUNCATE public.offers CASCADE`))?.code).toBe('42501');
    expect(await count('true')).toBe(9);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.offers`)).rows[0].n).toBe(4);
  });

  it('una oferta sin observaciones se sigue pudiendo borrar; una con filas legado no', async () => {
    expect(await errorOf(db, `DELETE FROM public.offers WHERE id = '${OFFER_EMPTY}'`)).toBeNull();
    expect((await errorOf(db, `DELETE FROM public.offers WHERE id = '${OFFER_LEGACY}'`))?.code).toBe('23503');
    // Las filas legado (no capturas) se pueden seguir borrando una a una, sin cambio respecto de 20261013.
    expect(await errorOf(db, `DELETE FROM public.offer_price_snapshots WHERE offer_id = '${OFFER_LEGACY}' AND source = 'create'`)).toBeNull();
    expect(await errorOf(db, `DELETE FROM public.offers WHERE id = '${OFFER_LEGACY}'`)).toBeNull();
  });

  it('price_capture_product_stats: última observación, días válidos UTC y rango, por producto', async () => {
    const r = await db.query<{ external_item_id: string; last_recorded_at: Date; valid_days: number; first_valid_at: Date; last_valid_at: Date }>(`
      SELECT * FROM public.price_capture_product_stats('mercadolibre_mx', ARRAY['MLM1','MLM2','MLM404'], '2026-09-01T00:00:00Z')
      ORDER BY external_item_id`);
    expect(r.rows.map((x) => x.external_item_id)).toEqual(['MLM1', 'MLM2']);
    const m1 = r.rows[0];
    // 5 válidas en 4 días UTC distintos; la inválida y la agotada no cuentan como días válidos,
    // pero sí como última observación.
    expect(m1.valid_days).toBe(4);
    expect(new Date(m1.first_valid_at).toISOString()).toBe('2026-09-20T10:00:00.000Z');
    expect(new Date(m1.last_valid_at).toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(new Date(m1.last_recorded_at).toISOString()).toBe('2026-10-12T11:00:00.000Z');
    expect(r.rows[1].valid_days).toBe(1);

    const windowed = await db.query<{ valid_days: number }>(`
      SELECT valid_days FROM public.price_capture_product_stats('mercadolibre_mx', ARRAY['MLM1'], '2026-10-01T00:00:00Z')`);
    expect(windowed.rows[0].valid_days).toBe(2);
    const other = await db.query(`SELECT * FROM public.price_capture_product_stats('amazon_mx', ARRAY['MLM1'], '2026-09-01T00:00:00Z')`);
    expect(other.rows).toHaveLength(0);
  });

  it('price_capture_product_stats: solo service_role puede ejecutarla', async () => {
    const priv = await db.query<{ role: string; ok: boolean }>(`
      SELECT r AS role, has_function_privilege(r, 'public.price_capture_product_stats(text, text[], timestamptz)', 'EXECUTE') AS ok
      FROM unnest(ARRAY['anon','authenticated','service_role']) AS r ORDER BY r`);
    expect(priv.rows).toEqual([
      { role: 'anon', ok: false },
      { role: 'authenticated', ok: false },
      { role: 'service_role', ok: true },
    ]);
  });
});

describe.runIf(!mod)('observaciones de precio: ciclo de vida en Postgres (PGlite)', () => {
  it.skip('PGlite no instalado: npm i --no-save @electric-sql/pglite@0.3', () => undefined);
});
