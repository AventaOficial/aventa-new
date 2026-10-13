/**
 * Importación reproducible de un recurso de Profeco «Quién es Quién en los Precios» (datos abiertos,
 * CC BY 4.0) como referencias de precio. Nunca escribe observaciones de Aventa.
 *
 * Por defecto solo lee y emite NDJSON (una referencia por línea) y un resumen en stderr:
 *
 *   npx tsx scripts/profeco-qqp-import.ts --resource=b07_2026_q1.csv > qqp-b07-q1.ndjson
 *   npx tsx scripts/profeco-qqp-import.ts --file=./b07_2026_q1.csv --resource=b07_2026_q1.csv --revision=2026-09-22T00:14:32.741989
 *
 * Con --resource (sin --file) descarga el CSV oficial y toma la revisión (`last_modified`) de CKAN.
 * Con --file la revisión es obligatoria: sin ella no hay idempotencia verificable.
 *
 * Escritura (solo base local y con la migración 20261013_price_references.sql aplicada):
 *
 *   npx tsx --env-file=.env.local scripts/profeco-qqp-import.ts --resource=b07_2026_q1.csv --target=local --confirm-write
 *
 * La escritura es INSERT ... ON CONFLICT (idempotency_key) DO NOTHING: reprocesar no duplica.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import { importProfecoLines, PROFECO_QQP, type ProfecoReference, type ResourceRevision } from '@/lib/despensa/references/profecoQqp';
import { extractSupabaseProjectRef, isProductionSupabaseRef, STAGING_SUPABASE_REF } from '@/lib/supabase/projectRefs';

const RESOURCE_BASE = `https://${PROFECO_QQP.resourceHost}/api_update/profeco/${PROFECO_QQP.datasetId}/`;

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

function fail(msg: string): never {
  console.error(`ABORT: ${msg}`);
  process.exit(2);
}

async function revisionFromCkan(resourceUrl: string): Promise<string> {
  const res = await fetch(PROFECO_QQP.packageApiUrl);
  if (!res.ok) fail(`CKAN respondió ${res.status}.`);
  const body = (await res.json()) as { result?: { license_id?: string; resources?: { url?: string; last_modified?: string | null }[] } };
  if (body.result?.license_id !== PROFECO_QQP.license) fail(`licencia inesperada en CKAN: ${body.result?.license_id ?? 'ninguna'}.`);
  const hit = body.result?.resources?.find((r) => r.url === resourceUrl);
  if (!hit?.last_modified) fail('el recurso no figura en el paquete de CKAN o no tiene last_modified.');
  return hit.last_modified;
}

async function* linesOf(stream: NodeJS.ReadableStream): AsyncIterable<string> {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

async function writeLocal(refs: ProfecoReference[]): Promise<{ inserted: number; skipped: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const ref = extractSupabaseProjectRef(url);
  if (!url || !key) fail('faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  if (isProductionSupabaseRef(ref) || ref === STAGING_SUPABASE_REF) fail('este script solo escribe en una base local.');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(url)) fail('la URL de Supabase no es local.');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  let inserted = 0;
  for (let i = 0; i < refs.length; i += 500) {
    const chunk = refs.slice(i, i + 500).map((r) => ({
      source: r.source,
      reference_key: r.referenceKey,
      need_id: r.needId,
      variant_id: r.variantId,
      presentation_key: r.presentationKey,
      brand: r.brand,
      chain_key: r.chainKey,
      chain_label: r.chainLabel,
      estado: r.estado,
      municipio: r.municipio,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      currency: r.currency,
      min_price: r.minPrice,
      median_price: r.medianPrice,
      max_price: r.maxPrice,
      observations: r.observations,
      establishments: r.establishments,
      product_sample: r.productSample,
      source_resource_url: r.sourceResourceUrl,
      source_revision: r.sourceRevision,
      parser_version: r.parserVersion,
      license: r.license,
      idempotency_key: r.idempotencyKey,
    }));
    const { data, error } = await supabase
      .from('price_references')
      .upsert(chunk, { onConflict: 'idempotency_key', ignoreDuplicates: true })
      .select('id');
    if (error) fail(`escritura local falló (${error.code ?? 'sin código'}).`);
    inserted += data?.length ?? 0;
  }
  return { inserted, skipped: refs.length - inserted };
}

async function main() {
  const resource = arg('resource');
  const file = arg('file');
  if (!resource || !/^b\d{2}_\d{4}_q\d\.csv$/i.test(resource)) fail('indica --resource=bMM_AAAA_qN.csv (nombre del recurso oficial).');
  const resourceUrl = `${RESOURCE_BASE}${resource}`;

  let revision: ResourceRevision;
  let stream: NodeJS.ReadableStream;
  if (file && file !== 'true') {
    const rev = arg('revision');
    if (!rev || rev === 'true') fail('con --file indica --revision=<last_modified de CKAN>.');
    revision = { url: resourceUrl, lastModified: rev };
    stream = createReadStream(file, { encoding: 'utf8' });
  } else {
    revision = { url: resourceUrl, lastModified: await revisionFromCkan(resourceUrl) };
    const res = await fetch(resourceUrl);
    if (!res.ok || !res.body) fail(`el recurso respondió ${res.status}.`);
    stream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).setEncoding('utf8');
  }

  const report = await importProfecoLines(linesOf(stream), revision);
  if (!report.header.ok) fail('el encabezado del CSV no coincide con el esquema esperado.');

  const target = arg('target');
  const write = arg('confirm-write') === 'true';
  let written: { inserted: number; skipped: number } | null = null;
  if (write) {
    if (target !== 'local') fail('la escritura solo se permite con --target=local.');
    written = await writeLocal(report.references);
  } else {
    for (const r of report.references) process.stdout.write(`${JSON.stringify(r)}\n`);
  }

  console.error(
    JSON.stringify({
      resource: revision.url,
      revision: revision.lastModified,
      license: PROFECO_QQP.license,
      rows: report.rows,
      accepted: report.accepted,
      rejected: report.rejected,
      references: report.references.length,
      written,
    }),
  );
}

main().catch(() => {
  console.error('profeco-qqp-import: error inesperado');
  process.exit(1);
});
