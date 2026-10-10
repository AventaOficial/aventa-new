/**
 * Regenera el inventario declarado desde docs/supabase-migrations.
 * No abre una base, no lee filas y no imprime secretos.
 *
 * node --experimental-strip-types scripts/generate-database-atlas.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMigrationFiles } from '../lib/databaseAtlas/parseMigrations.ts';

const dir = join(process.cwd(), 'docs', 'supabase-migrations');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));

const objects = parseMigrationFiles(files);
const document = {
  source: 'migrations',
  generatedAt: '2026-10-10T21:40:00.000Z',
  fileCount: files.length,
  warning: 'Este inventario sale del SQL versionado. No es el esquema real de un entorno hasta cruzarlo con un catálogo observado.',
  objects,
};

writeFileSync(join(process.cwd(), 'lib', 'databaseAtlas', 'declared.generated.json'), `${JSON.stringify(document)}\n`);
const tables = objects.filter((item) => item.kind === 'table').length;
console.log(JSON.stringify({ files: files.length, objects: objects.length, tables }));
