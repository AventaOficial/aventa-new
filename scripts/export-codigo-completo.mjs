/**
 * Genera Codigo_Completo.txt con todo el código fuente del proyecto,
 * formato:
 *   --- Contenido de: <ruta> ---
 *   <contenido del archivo>
 *
 * Uso: node scripts/export-codigo-completo.mjs
 * Salida: ./Codigo_Completo.txt (en la raíz del repo)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'Codigo_Completo.txt');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'dist',
  'build',
  '.turbo',
  'coverage',
  '.vercel',
  'mcps',
]);

const SKIP_FILES = new Set(['package-lock.json', 'Codigo_Completo.txt']);

const EXT_OK = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.md',
  '.sql',
  '.json',
  '.toml',
  '.yml',
  '.yaml',
]);

/** No incluir JSON enormes salvo los útiles */
const MAX_BYTES = 400_000;

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name);
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (shouldSkipDir(e.name)) continue;
      walk(full, files);
    } else {
      if (SKIP_FILES.has(e.name)) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!EXT_OK.has(ext)) continue;
      try {
        const st = fs.statSync(full);
        if (st.size > MAX_BYTES) continue;
      } catch {
        continue;
      }
      files.push(full);
    }
  }
  return files;
}

function main() {
  const all = walk(ROOT);
  all.sort((a, b) => a.localeCompare(b, 'en'));

  const chunks = [];
  chunks.push('Codigo_Completo.txt');
  chunks.push(`--- Exportado: ${new Date().toISOString()} ---`);
  chunks.push(`--- Raíz: ${ROOT} ---`);
  chunks.push(`--- Archivos: ${all.length} ---`);
  chunks.push('');

  for (const full of all) {
    const rel = path.relative(ROOT, full);
    const display = rel.split(path.sep).join('/');
    chunks.push(`--- Contenido de: ${full} ---`);
    chunks.push(`--- (relativo: ${display}) ---`);
    chunks.push('');
    try {
      const body = fs.readFileSync(full, 'utf8');
      chunks.push(body);
    } catch (err) {
      chunks.push(`[Error leyendo archivo: ${err.message}]`);
    }
    chunks.push('');
    chunks.push('');
  }

  fs.writeFileSync(OUT, chunks.join('\n'), 'utf8');
  console.log(`Listo: ${all.length} archivos → ${OUT}`);
  console.log(`Tamaño aprox: ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
}

main();
