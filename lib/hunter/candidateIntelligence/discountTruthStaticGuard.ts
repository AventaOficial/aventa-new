/**
 * Static guard: detect silent UNKNOWN→0 patterns on critical ingest path.
 * Allowlisted domains are independent / display / legacy bridges.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Paths (posix-ish) under repo root that are critical for discount truth. */
export const DISCOUNT_TRUTH_CRITICAL_GLOBS = [
  'lib/bots/ingest/',
  'lib/hunter/candidateIntelligence/',
  'lib/hunter/dealQualification/',
  'lib/hunter/enrichment/',
  'lib/hunter/dayToDay/',
  'lib/hunter/supply/',
  'lib/supplyIntelligence/',
  'lib/verifier/',
] as const;

/** Files/dirs allowed to use ?? 0 / || 0 near discount terms (documented). */
export const DISCOUNT_ZERO_ALLOWLIST: Array<{ pathIncludes: string; reason: string }> = [
  {
    pathIncludes: 'lib/bots/ingest/canonicalDiscount.ts',
    reason: 'Named toLegacyMetaDiscountPercent bridge + docs',
  },
  {
    pathIncludes: 'lib/bots/ingest/mlPriceEngine.ts',
    reason: 'effectiveDiscountPercent price-intel signal (class C)',
  },
  {
    pathIncludes: 'lib/bots/ingest/scoreIngestCandidate.ts',
    reason: 'Score points when card null → 0 pts (not meta write)',
  },
  {
    pathIncludes: 'lib/bots/ingest/optimizeIngestTitle.ts',
    reason: 'Title display — no % claim when UNKNOWN',
  },
  {
    pathIncludes: 'lib/bots/ingest/workerCardScoreDiagnostics.ts',
    reason: 'Diagnostics display',
  },
  {
    pathIncludes: 'tests/',
    reason: 'Fixtures / assertions',
  },
];

const SUSPECT_RE =
  /(?:discountPercent|discount_percentage|discountPercentage)\s*(?:\?\?|\|\|)\s*0\b|(?:Number|parseFloat|parseInt)\(\s*(?:meta\.)?discountPercent\s*\?\?\s*0\s*\)/;

export type DiscountStaticFinding = {
  file: string;
  line: number;
  text: string;
  allowlisted: boolean;
  reason?: string;
};

function walkTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === 'tmp') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function isCritical(rel: string): boolean {
  const n = rel.replace(/\\/g, '/');
  return DISCOUNT_TRUTH_CRITICAL_GLOBS.some((g) => n.startsWith(g) || n.includes(`/${g}`));
}

function allowlistHit(rel: string): { pathIncludes: string; reason: string } | null {
  const n = rel.replace(/\\/g, '/');
  for (const a of DISCOUNT_ZERO_ALLOWLIST) {
    if (n.includes(a.pathIncludes.replace(/\\/g, '/'))) return a;
  }
  return null;
}

/**
 * Scan repo (or given roots) for silent UNKNOWN→0 on critical path.
 */
export function scanDiscountTruthStatic(repoRoot: string): {
  findings: DiscountStaticFinding[];
  criticalViolations: DiscountStaticFinding[];
  ok: boolean;
} {
  const findings: DiscountStaticFinding[] = [];
  const files = walkTsFiles(repoRoot);
  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    if (!isCritical(rel) && !rel.startsWith('lib/bots/ingest/') && !rel.startsWith('lib/hunter/')) {
      // Only scan critical trees
      if (!DISCOUNT_TRUTH_CRITICAL_GLOBS.some((g) => rel.startsWith(g))) continue;
    }
    if (!isCritical(rel)) continue;
    let text: string;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!SUSPECT_RE.test(line)) return;
      // Skip comments that document the anti-pattern
      if (/Do NOT use \?\? 0|never|anti-\?\? 0|never?? 0|never\| 0/i.test(line)) return;
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
      const allow = allowlistHit(rel);
      findings.push({
        file: rel,
        line: idx + 1,
        text: line.trim().slice(0, 200),
        allowlisted: Boolean(allow),
        reason: allow?.reason,
      });
    });
  }
  const criticalViolations = findings.filter((f) => !f.allowlisted);
  return { findings, criticalViolations, ok: criticalViolations.length === 0 };
}
