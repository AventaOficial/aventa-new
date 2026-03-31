/**
 * Genera Codigo_Completo.txt: auditoría contextual + todo el código fuente útil.
 *
 * Uso: node scripts/export-codigo-completo.mjs
 * Salida: ./Codigo_Completo.txt (raíz del repo; en .gitignore)
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

/** Archivos mayores se omiten (evitar volcados gigantes). */
const MAX_BYTES = 800_000;

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

function walkDocsMd(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDocsMd(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function topLevelDirs() {
  try {
    return fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !shouldSkipDir(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function countByExt(files) {
  const m = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase() || '(sin ext)';
    m[ext] = (m[ext] || 0) + 1;
  }
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, n]) => `  ${ext}: ${n}`)
    .join('\n');
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function buildPreamble(allFiles) {
  const pkg = readJsonSafe(path.join(ROOT, 'package.json'));
  const dirs = topLevelDirs();
  const docMds = walkDocsMd(path.join(ROOT, 'docs')).sort((a, b) => a.localeCompare(b, 'en'));
  const docLines = docMds.map((f) => `  - ${path.relative(ROOT, f).split(path.sep).join('/')}`);

  const lines = [];
  lines.push('='.repeat(80));
  lines.push('AVENTA — AUDITORÍA Y MAPA DEL PROYECTO (bloque generado automáticamente)');
  lines.push('='.repeat(80));
  lines.push(`Generado: ${new Date().toISOString()}`);
  lines.push(`Raíz: ${ROOT}`);
  lines.push('');
  lines.push('--- 1. Qué es este archivo ---');
  lines.push('Primero: contexto y mapa para revisión humana o herramientas externas.');
  lines.push('Después: volcado concatenado de código y docs del repo (sin node_modules ni .next).');
  lines.push('Archivos omitidos: >800KB por archivo, package-lock, este txt.');
  lines.push('Por archivo .ts/.tsx/.js: línea de conteo + lista heurística de funciones/exports antes del código.');
  lines.push('');
  lines.push('--- 2. Identidad del paquete ---');
  if (pkg) {
    lines.push(`  nombre: ${pkg.name}`);
    lines.push(`  versión: ${pkg.version}`);
    lines.push(`  scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
    lines.push(`  dependencias principales: ${Object.keys(pkg.dependencies || {}).join(', ')}`);
  }
  lines.push('');
  lines.push('--- 3. Carpetas en la raíz (visibles) ---');
  lines.push(dirs.map((d) => `  /${d}`).join('\n'));
  lines.push('');
  lines.push('--- 4. Archivos incluidos en el volcado (resumen) ---');
  lines.push(`  total: ${allFiles.length}`);
  lines.push(countByExt(allFiles));
  lines.push('');
  lines.push('--- 5. Sistemas críticos (dónde mirar en código) ---');
  lines.push('  Feed home: app/page.tsx, lib/offers/feedService.ts, lib/offers/homeFeedFilters.ts, app/api/feed/home/route.ts');
  lines.push('  Feed personalizado: app/api/feed/for-you/route.ts');
  lines.push('  Votos: app/api/votes/route.ts, lib/votes/, app/components/OfferCard.tsx');
  lines.push('  Subir oferta: app/components/ActionBar.tsx, app/api/offers/route.ts');
  lines.push('  Moderación: app/admin/moderation/, app/api/admin/moderate-offer/route.ts');
  lines.push('  Auth / perfil: app/providers/, lib/supabase/, app/auth/');
  lines.push('  Contratos Zod: lib/contracts/');
  lines.push('  Visibilidad / health: lib/monitoring/, app/api/health/route.ts');
  lines.push('  Bot ingesta: lib/bots/ingest/, app/api/cron/bot-ingest/route.ts, app/operaciones/components/BotIngestPanel.tsx');
  lines.push('');
  lines.push('--- 6. Lista de documentación Markdown (docs/) ---');
  lines.push(docLines.length ? docLines.join('\n') : '  (ninguno)');
  lines.push('');
  lines.push('--- 7. Checklist rápido pre-lanzamiento (manual) ---');
  lines.push('  [ ] Feed: categorías, orden, paginación, “Día a día” vs API');
  lines.push('  [ ] Votos: POST /api/votes, reflejo en tarjeta');
  lines.push('  [ ] Subir oferta: flujo completo + moderación');
  lines.push('  [ ] Navegación: enlaces /oferta, /tienda, /categoria, admin');
  lines.push('  [ ] Móvil: tap targets, scroll, modales');
  lines.push('');
  lines.push('--- 8. Regenerar ---');
  lines.push('  node scripts/export-codigo-completo.mjs');
  lines.push('');
  lines.push('='.repeat(80));
  lines.push('INICIO DEL VOLCADO DE ARCHIVOS (uno tras otro)');
  lines.push('='.repeat(80));
  lines.push('');
  return lines.join('\n');
}

/**
 * Lista heurística de funciones/clases/exportaciones (TypeScript/JavaScript).
 * No sustituye un parser; sirve como mapa rápido antes del código completo.
 */
function extractSymbolHints(source, ext) {
  if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return [];
  const seen = new Set();
  const add = (name) => {
    if (name && name.length < 80 && !seen.has(name)) {
      seen.add(name);
    }
  };

  const patterns = [
    /^\s*export\s+async\s+function\s+(\w+)/gm,
    /^\s*export\s+function\s+(\w+)/gm,
    /^\s*export\s+default\s+async\s+function\s+(\w+)/gm,
    /^\s*export\s+default\s+function\s+(\w+)/gm,
    /^\s*async\s+function\s+(\w+)/gm,
    /^\s*function\s+(\w+)\s*\(/gm,
    /^\s*export\s+class\s+(\w+)/gm,
    /^\s*class\s+(\w+)/gm,
    /^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
    /^\s*export\s+const\s+(\w+)\s*=\s*function/gm,
    /^\s*const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm,
  ];

  for (const re of patterns) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(source)) !== null) {
      add(m[1]);
    }
  }

  return [...seen].sort((a, b) => a.localeCompare(b, 'en'));
}

function main() {
  const all = walk(ROOT);
  all.sort((a, b) => a.localeCompare(b, 'en'));

  const chunks = [];
  chunks.push(buildPreamble(all));
  chunks.push('');

  for (const full of all) {
    const rel = path.relative(ROOT, full);
    const display = rel.split(path.sep).join('/');
    const ext = path.extname(full).toLowerCase();
    chunks.push(`--- Contenido de: ${full} ---`);
    chunks.push(`--- (relativo: ${display}) ---`);
    chunks.push('');
    try {
      const body = fs.readFileSync(full, 'utf8');
      const lines = body.split(/\r?\n/);
      chunks.push(`--- Líneas en archivo: ${lines.length} ---`);
      const hints = extractSymbolHints(body, ext);
      if (hints.length) {
        chunks.push(
          `--- Símbolos detectados (heurística, funciones/clases/const tipo función): ${hints.length} ---`
        );
        chunks.push(hints.join(', '));
        chunks.push('');
      }
      chunks.push(body);
    } catch (err) {
      chunks.push(`[Error leyendo archivo: ${err.message}]`);
    }
    chunks.push('');
    chunks.push('');
  }

  fs.writeFileSync(OUT, chunks.join('\n'), 'utf8');
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`Listo: ${all.length} archivos → ${OUT}`);
  console.log(`Tamaño aprox: ${mb} MB`);
}

main();
