/**
 * Verificación local de docs/supabase-migrations/20261012_offer_price_observations.sql en
 * Postgres en proceso (PGlite). No se conecta a ninguna base remota.
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

const db = new PGlite();
const results = [];
const ok = (name, cond) => results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
async function fails(name, sql, codeOrText) {
  try {
    await db.exec(sql);
    ok(`${name} (debÃ­a fallar)`, false);
  } catch (e) {
    const msg = `${e.code ?? ''} ${e.message}`;
    ok(`${name} â†’ ${msg.slice(0, 90)}`, codeOrText ? msg.includes(codeOrText) : true);
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
    ('22222222-2222-2222-2222-222222222222', 'Frijol negro 900 g');
  INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES
    ('11111111-1111-1111-1111-111111111111', 40, 'create'),
    ('11111111-1111-1111-1111-111111111111', 38, 'app');
`);

await db.exec(mig);
const oidsOf = async () =>
  (await db.query(`SELECT string_agg(conname || ':' || oid::text, ',' ORDER BY conname) AS s FROM pg_constraint WHERE conrelid = 'public.offer_price_snapshots'::regclass`)).rows[0].s;
const first = await oidsOf();
await db.exec(mig);
ok('migraciÃ³n aplicada dos veces (idempotente)', true);
ok('la segunda aplicaciÃ³n no recrea restricciones', first === (await oidsOf()));

const legacy = await db.query(`SELECT count(*)::int AS n, bool_and(validation_status IS NULL) AS nulls, bool_and(validation_reasons = '{}') AS empty FROM public.offer_price_snapshots`);
ok('filas legado conservadas sin rellenar', legacy.rows[0].n === 2 && legacy.rows[0].nulls && legacy.rows[0].empty);

const checks = await db.query(`SELECT conname FROM pg_constraint WHERE conrelid = 'public.offer_price_snapshots'::regclass AND contype = 'c' ORDER BY conname`);
ok(`CHECK de source Ãºnico y ampliado: ${checks.rows.map((r) => r.conname).join(', ')}`, checks.rows.filter((r) => r.conname.includes('source')).length === 1);

await db.exec(`INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 37, 'update')`);
ok('fuentes legado siguen permitidas', true);

const capture = (key, price = 34, status = 'valid', offer = '11111111-1111-1111-1111-111111111111') => `
  INSERT INTO public.offer_price_snapshots
    (offer_id, price, source, currency, identity_key, presentation_key, scope_kind, scope_label, availability,
     capture_method, validation_status, validation_reasons, policy_version, idempotency_key, capture_run_id, provenance)
  VALUES ('${offer}', ${price}, 'capture', 'MXN', 'mercadolibre_mx:MLM1|alimentos.arroz|blanco|mass:1000:-', 'mass:1000:-',
    'online', 'MX', 'in_stock', 'ml_official_api', '${status}', '{}', 'price-observation-v1', '${key}', 'pc_test', '{"detail":"items_prices"}')
  RETURNING id`;

const inserted = await db.query(capture('k1'));
const capId = inserted.rows[0].id;
ok('captura vÃ¡lida insertada', !!capId);

await fails('idempotencia: misma llave', capture('k1', 35), '23505');
await fails('fuente desconocida', `INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 1, 'scraper')`, '23514');
await fails('captura sin validaciÃ³n ni llave', `INSERT INTO public.offer_price_snapshots (offer_id, price, source) VALUES ('11111111-1111-1111-1111-111111111111', 1, 'capture')`, '23514');
await fails('estado de validaciÃ³n desconocido', capture('k2', 34, 'approved'), '23514');
await fails('moneda no ISO', capture('k3').replace(`'MXN'`, `'pesos'`), '23514');
await fails('evidencia inmutable: precio', `UPDATE public.offer_price_snapshots SET price = 1 WHERE id = '${capId}'`, 'inmutable');
await fails('evidencia inmutable: fecha', `UPDATE public.offer_price_snapshots SET recorded_at = now() - interval '1 day' WHERE id = '${capId}'`, 'inmutable');

await db.exec(`UPDATE public.offer_price_snapshots SET validation_status = 'superseded', validation_reasons = '{review:superseded:x}' WHERE id = '${capId}'`);
ok('el estado de validaciÃ³n sÃ­ puede avanzar', (await db.query(`SELECT validation_status FROM public.offer_price_snapshots WHERE id = '${capId}'`)).rows[0].validation_status === 'superseded');

const fix = (await db.query(capture('k4', 36))).rows[0].id;
await db.exec(`UPDATE public.offer_price_snapshots SET corrects_snapshot_id = '${capId}' WHERE id = '${fix}'`);
ok('enlace de correcciÃ³n permitido', true);

await fails('no se borra una captura con la oferta viva', `DELETE FROM public.offer_price_snapshots WHERE id = '${capId}'`, 'no se eliminan');
await db.exec(`DELETE FROM public.offer_price_snapshots WHERE source = 'create'`);
ok('filas legado siguen pudiÃ©ndose borrar (sin cambio de comportamiento)', true);

await db.query(capture('k5', 28, 'valid', '22222222-2222-2222-2222-222222222222'));
await db.exec(`DELETE FROM public.offers WHERE id = '22222222-2222-2222-2222-222222222222'`);
const left = await db.query(`SELECT count(*)::int AS n FROM public.offer_price_snapshots WHERE offer_id = '22222222-2222-2222-2222-222222222222'`);
ok('borrar la oferta sigue en cascada', left.rows[0].n === 0);

const idx = await db.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'offer_price_snapshots' ORDER BY indexname`);
ok(`Ã­ndices: ${idx.rows.map((r) => r.indexname).join(', ')}`, idx.rows.some((r) => r.indexname === 'uq_offer_price_snapshots_idempotency_key'));

const plan = await db.query(`EXPLAIN SELECT offer_id FROM public.offer_price_snapshots WHERE source = 'capture' AND offer_id = ANY(ARRAY['11111111-1111-1111-1111-111111111111'::uuid]) AND recorded_at >= now() - interval '20 hours'`);
results.push(`INFO plan: ${plan.rows.map((r) => r['QUERY PLAN']).join(' | ').slice(0, 200)}`);

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL'));
console.log(failed.length ? `\n${failed.length} FALLAS` : '\nTODO OK');
process.exit(failed.length ? 1 : 0);
