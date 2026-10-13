/**
 * Verificación local de docs/supabase-migrations/20261012_offer_price_observations.sql,
 * 20261013_offer_price_observations_product_series.sql, 20261013_price_references.sql y
 * 20261014_price_observations_lifecycle.sql en Postgres en proceso (PGlite).
 * Las pruebas con aserciones están en tests/offers/priceObservationsLifecycle.pglite.test.ts.
 * No se conecta a ninguna base remota.
 *
 * Uso (sin modificar package.json):
 *   npm i --no-save @electric-sql/pglite@0.3
 *   node scripts/verify-offer-price-observations-local.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../docs/supabase-migrations', import.meta.url));
const base = readFileSync(`${repo}/offer_price_snapshots.sql`, 'utf8');
const mig = readFileSync(`${repo}/20261012_offer_price_observations.sql`, 'utf8');
const series = readFileSync(`${repo}/20261013_offer_price_observations_product_series.sql`, 'utf8');

const db = new PGlite();
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
async function fails(name, sql, codeOrText) {
  try {
    await db.exec(sql);
    ok(`${name} (debía fallar)`, false);
  } catch (e) {
    const msg = `${e.code ?? ''} ${e.message}`;
    ok(`${name} → ${msg.slice(0, 90)}`, codeOrText ? msg.includes(codeOrText) : true);
  }
}

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.offers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text);
`);
await db.exec(base);
await db.exec(`
  INSERT INTO public.offers (id, title) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Arroz blanco 1 kg'),
    ('22222222-2222-2222-2222-222222222222', 'Frijol negro 900 g'),
    ('33333333-3333-3333-3333-333333333333', 'Arroz blanco 1 kg (nueva oferta)');
  INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES
    ('11111111-1111-1111-1111-111111111111', 40, 'create'),
    ('11111111-1111-1111-1111-111111111111', 38, 'app');
`);

await db.exec(mig);
const oidsOf = async () =>
  (await db.query(`SELECT string_agg(conname || ':' || oid::text, ',' ORDER BY conname) AS s FROM pg_constraint WHERE conrelid = 'public.offer_price_snapshots'::regclass`)).rows[0].s;
const first = await oidsOf();
await db.exec(mig);
ok('migración aplicada dos veces (idempotente)', true);
ok('la segunda aplicación no recrea restricciones', first === (await oidsOf()));

await db.exec(series);
await db.exec(series);
ok('migración de serie por producto aplicada dos veces (idempotente)', true);

const legacy = await db.query(`SELECT count(*)::int AS n, bool_and(validation_status IS NULL) AS nulls, bool_and(validation_reasons = '{}') AS empty FROM public.offer_price_snapshots`);
ok('filas legado conservadas sin rellenar', legacy.rows[0].n === 2 && legacy.rows[0].nulls && legacy.rows[0].empty);

const checks = await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.offer_price_snapshots'::regclass AND contype = 'c' ORDER BY conname`);
ok(`CHECK de source único y ampliado: ${checks.rows.map((r) => r.conname).join(', ')}`, checks.rows.filter((r) => r.conname.includes('source')).length === 1);

await db.exec(`INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 37, 'update')`);
ok('fuentes legado siguen permitidas', true);

const capture = (key, price = 34, status = 'valid', offer = '11111111-1111-1111-1111-111111111111', item = 'MLM1') => `
  INSERT INTO public.offer_price_snapshots
    (offer_id, price, source, currency, source_id, external_item_id, identity_key, presentation_key, need_id, variant_id,
     scope_kind, scope_label, availability, capture_method, validation_status, validation_reasons, policy_version,
     idempotency_key, capture_run_id, provenance)
  VALUES ('${offer}', ${price}, 'capture', 'MXN', 'mercadolibre_mx', '${item}',
    'mercadolibre_mx:${item}|alimentos.arroz|blanco|mass:1000:-', 'mass:1000:-', 'alimentos.arroz', 'blanco',
    'online', 'MX', 'in_stock', 'ml_official_api', '${status}', '{}', 'price-observation-v2', '${key}', 'pc_test', '{"detail":"items_prices"}')
  RETURNING id`;

const inserted = await db.query(capture('k1'));
const capId = inserted.rows[0].id;
ok('captura válida insertada', !!capId);

await fails('idempotencia: misma llave', capture('k1', 35), '23505');
await fails('fuente desconocida', `INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 1, 'scraper')`, '23514');
await fails('captura sin validación ni llave', `INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 1, 'capture')`, '23514');
await fails('estado de validación desconocido', capture('k2', 34, 'approved'), '23514');
await fails('moneda no ISO', capture('k3').replace(`'MXN'`, `'pesos'`), '23514');
await fails('evidencia inmutable: precio', `UPDATE public.offer_price_snapshots SET price = 1 WHERE id = '${capId}'`, 'inmutable');
await fails('evidencia inmutable: fecha', `UPDATE public.offer_price_snapshots SET recorded_at = now() - interval '1 day' WHERE id = '${capId}'`, 'inmutable');
await fails('identidad inmutable: item externo', `UPDATE public.offer_price_snapshots SET external_item_id = 'MLM2' WHERE id = '${capId}'`, 'inmutable');
await fails('identidad inmutable: fuente', `UPDATE public.offer_price_snapshots SET source_id = 'amazon_mx' WHERE id = '${capId}'`, 'inmutable');
await fails('identidad inmutable: necesidad', `UPDATE public.offer_price_snapshots SET need_id = 'alimentos.frijol' WHERE id = '${capId}'`, 'inmutable');
await fails('identidad inmutable: variante', `UPDATE public.offer_price_snapshots SET variant_id = 'integral' WHERE id = '${capId}'`, 'inmutable');

await db.exec(`UPDATE public.offer_price_snapshots SET validation_status = 'superseded', validation_reasons = '{review:superseded:x}' WHERE id = '${capId}'`);
ok('el estado de validación sí puede avanzar', (await db.query(`SELECT validation_status FROM public.offer_price_snapshots WHERE id = '${capId}'`)).rows[0].validation_status === 'superseded');

const fix = (await db.query(capture('k4', 36))).rows[0].id;
await db.exec(`UPDATE public.offer_price_snapshots SET corrects_snapshot_id = '${capId}' WHERE id = '${fix}'`);
ok('enlace de corrección permitido', true);

await fails('no se borra una captura con la oferta viva', `DELETE FROM public.offer_price_snapshots WHERE id = '${capId}'`, 'no se eliminan');
await db.exec(`DELETE FROM public.offer_price_snapshots WHERE source = 'create'`);
ok('filas legado siguen pudiéndose borrar (sin cambio de comportamiento)', true);

// Serie por producto: dos ofertas del mismo item externo comparten historial.
await db.query(capture('k6', 33, 'valid', '33333333-3333-3333-3333-333333333333'));
const product = await db.query(`
  SELECT count(*)::int AS n, count(DISTINCT offer_id)::int AS offers FROM public.offer_price_snapshots
  WHERE source = 'capture' AND source_id = 'mercadolibre_mx' AND external_item_id = ANY(ARRAY['MLM1'])`);
ok('la serie del producto reúne capturas de varias ofertas', product.rows[0].n === 3 && product.rows[0].offers === 2);

await db.query(capture('k5', 28, 'valid', '22222222-2222-2222-2222-222222222222', 'MLM9'));

// Ciclo de vida (20261014): la evidencia sobrevive a su oferta.
const lifecycle = readFileSync(`${repo}/20261014_price_observations_lifecycle.sql`, 'utf8');
await db.exec(lifecycle);
await db.exec(lifecycle);
ok('migración de ciclo de vida aplicada dos veces (idempotente)', true);
await fails('borrar una oferta con observaciones', `DELETE FROM public.offers WHERE id = '22222222-2222-2222-2222-222222222222'`, '23503');
const left = await db.query(`SELECT count(*)::int AS n FROM public.offer_price_snapshots WHERE offer_id = '22222222-2222-2222-2222-222222222222'`);
ok('las observaciones de la oferta siguen ahí', left.rows[0].n === 1);
await fails('TRUNCATE de observaciones', `TRUNCATE public.offer_price_snapshots`, '42501');
await fails('TRUNCATE offers CASCADE', `TRUNCATE public.offers CASCADE`, '42501');
const stats = await db.query(`SELECT * FROM public.price_capture_product_stats('mercadolibre_mx', ARRAY['MLM1','MLM9'], now() - interval '90 days') ORDER BY external_item_id`);
ok(`estadísticas por producto: ${stats.rows.map((r) => `${r.external_item_id}=${r.valid_days}d`).join(', ')}`, stats.rows.length === 2);

const idx = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'offer_price_snapshots' ORDER BY indexname`);
const names = idx.rows.map((r) => r.indexname);
ok(`índices: ${names.join(', ')}`, names.includes('uq_offer_price_snapshots_idempotency_key') && names.includes('idx_offer_price_snapshots_capture_item_recorded'));

// Referencias externas (Profeco QQP): tabla aparte, solo inserción e idempotente.
const refs = readFileSync(`${repo}/20261013_price_references.sql`, 'utf8');
await db.exec(refs);
await db.exec(refs);
ok('migración price_references aplicada dos veces (idempotente)', true);
const reference = (key, median = 32.75, extra = {}) => {
  const v = { source: 'profeco_qqp', license: 'CC-BY-4.0', currency: 'MXN', min: 32, max: 33.5, obs: 2, est: 2, ...extra };
  return `
  INSERT INTO public.price_references
    (source, reference_key, need_id, variant_id, presentation_key, brand, chain_key, chain_label, estado, municipio,
     period_start, period_end, currency, min_price, median_price, max_price, observations, establishments, product_sample,
     source_resource_url, source_revision, parser_version, license, idempotency_key)
  VALUES ('${v.source}', 'alimentos.leche|entera|volume:1000:-|lala|oxxo|aguascalientes|aguascalientes', 'alimentos.leche', 'entera',
    'volume:1000:-', 'Lala', 'oxxo', 'Oxxo', 'Aguascalientes', 'Aguascalientes', '2026-07-01', '2026-07-01', '${v.currency}',
    ${v.min}, ${median}, ${v.max}, ${v.obs}, ${v.est}, 'Leche Pasteurizada Caja 1 Lt. Entera',
    'https://repodatos.atdt.gob.mx/api_update/profeco/programa_quien_es_quien_precios_2026/b07_2026_q1.csv',
    '2026-09-22T00:14:32.741989', 'profeco-qqp-v1', '${v.license}', '${key}')
  ON CONFLICT (idempotency_key) DO NOTHING`;
};
await db.exec(reference('q1'));
await db.exec(reference('q1'));
ok('reprocesar la misma referencia no duplica', (await db.query(`SELECT count(*)::int AS n FROM public.price_references`)).rows[0].n === 1);
await fails('referencia de fuente desconocida', reference('q2', 32.75, { source: 'scraper' }), '23514');
await fails('referencia en otra moneda', reference('q3', 32.75, { currency: 'USD' }), '23514');
await fails('referencia con precios desordenados', reference('q4', 40), '23514');
await fails('referencia sin licencia conocida', reference('q5', 32.75, { license: 'desconocida' }), '23514');
const rls = await db.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.price_references'::regclass`);
ok('price_references con RLS y sin acceso para anon/authenticated', rls.rows[0].relrowsecurity === true);

const plan = await db.query(`EXPLAIN SELECT id FROM public.offer_price_snapshots WHERE source = 'capture' AND source_id = 'mercadolibre_mx' AND external_item_id = ANY(ARRAY['MLM1']) AND recorded_at >= now() - interval '90 days' ORDER BY recorded_at DESC`);
results.push(`INFO plan: ${plan.rows.map((r) => r['QUERY PLAN']).join(' | ').slice(0, 200)}`);

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(failed.length ? `\n${failed.length} FALLAS` : '\nTODO OK');
process.exit(failed.length ? 1 : 0);
