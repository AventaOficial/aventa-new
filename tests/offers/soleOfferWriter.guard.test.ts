/**
 * Architectural guard: production offer INSERT/UPSERT must go through ingestOfferObservation.
 *
 * Structural exclusions (not a manual file allowlist):
 * - tests/, *.test.ts, *.integration.test.ts
 * - docs/, migrations
 * - scripts/staging-*, scripts/*canary*, scripts/*staging* (staging QA only)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Runtime trees that must not mint offers directly. */
const PRODUCTION_SCAN_ROOTS = ['lib', 'app', 'browser-extension', 'scripts'] as const;

/** Sole authorized writer in production runtime code. */
const SOLE_WRITER_REL = 'lib/offers/ingestion/ingestOfferObservation.ts';

/** Flexible `.from('offers'|'public.offers').insert|upsert` — single/double/backtick quotes. */
const OFFERS_WRITE_RE =
  /\.from\s*\(\s*[`'"]+(?:public\.)?offers[`'"]+\s*\)\s*\.\s*(insert|upsert)\s*\(/;

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function isExcludedFromGuard(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  if (p.startsWith('docs/')) return true;
  if (p.includes('/tests/') || p.startsWith('tests/')) return true;
  if (/\.(integration\.)?test\.(ts|tsx)$/.test(p)) return true;
  if (p.includes('/supabase-migrations/')) return true;
  if (/^scripts\/staging-/.test(p)) return true;
  if (/^scripts\/.*canary.*\.ts$/.test(p)) return true;
  if (/^scripts\/.*staging.*\.ts$/.test(p)) return true;
  return false;
}

/** Collapse whitespace so multiline `.from('offers')\n.insert(` is detected. */
function normalizeForScan(source: string): string {
  return source.replace(/\s+/g, ' ');
}

function collectProductionOfferWriters(): string[] {
  const offenders: string[] = [];
  for (const root of PRODUCTION_SCAN_ROOTS) {
    const absRoot = join(ROOT, root);
    try {
      statSync(absRoot);
    } catch {
      continue;
    }
    for (const abs of walkTsFiles(absRoot)) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/');
      if (rel === SOLE_WRITER_REL) continue;
      if (isExcludedFromGuard(rel)) continue;
      const text = normalizeForScan(readFileSync(abs, 'utf8'));
      if (OFFERS_WRITE_RE.test(text)) offenders.push(rel);
    }
  }
  return offenders.sort();
}

describe('sole offer writer guard', () => {
  it('no production path inserts/upserts offers outside ingestOfferObservation', () => {
    const offenders = collectProductionOfferWriters();
    expect(
      offenders,
      `Direct offers insert/upsert outside ingest: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('sole writer file still contains the authorized offers.insert', () => {
    const ingest = normalizeForScan(readFileSync(join(ROOT, SOLE_WRITER_REL), 'utf8'));
    expect(ingest).toMatch(OFFERS_WRITE_RE);
    expect(ingest).not.toContain('createCommunityOfferPending');
  });

  it('public POST, batch, bot and community adapter call ingestOfferObservation', () => {
    const publicRoute = readFileSync(join(ROOT, 'app/api/offers/route.ts'), 'utf8');
    const bot = readFileSync(join(ROOT, 'lib/bots/ingest/insertIngestedOffer.ts'), 'utf8');
    const batch = readFileSync(join(ROOT, 'app/api/admin/offer-batch/item/route.ts'), 'utf8');
    const community = readFileSync(join(ROOT, 'lib/offers/createCommunityOffer.ts'), 'utf8');
    const extension = readFileSync(join(ROOT, 'browser-extension/src/api/aventa.ts'), 'utf8');

    expect(publicRoute).toContain('ingestOfferObservation');
    expect(publicRoute).toContain("onDuplicate: 'reject'");
    expect(normalizeForScan(publicRoute)).not.toMatch(OFFERS_WRITE_RE);

    expect(bot).toContain('ingestOfferObservation');
    expect(bot).toContain('assertMachineOfferWriteAuthorized');
    expect(normalizeForScan(bot)).not.toMatch(OFFERS_WRITE_RE);

    expect(batch).toContain('ingestOfferObservation');
    expect(community).toContain('ingestOfferObservation');
    expect(normalizeForScan(community)).not.toMatch(OFFERS_WRITE_RE);

    expect(extension).toContain('/api/offers');
    expect(normalizeForScan(extension)).not.toMatch(OFFERS_WRITE_RE);
  });

  it('findDuplicateOfferByUrl is documented as non-authoritative for dedupe', () => {
    const finder = readFileSync(join(ROOT, 'lib/offers/findDuplicateOffer.ts'), 'utf8');
    const bot = readFileSync(join(ROOT, 'lib/bots/ingest/insertIngestedOffer.ts'), 'utf8');
    expect(finder).toMatch(/diagnóstico|Diagnóstico|no cambia la decisión/i);
    expect(bot).toContain('ingestOfferObservation');
    expect(bot).toMatch(/preDup|findDuplicateOfferByUrl/);
    expect(bot).toMatch(/Dedupe authority|dedupe authority/i);
  });
});
