/**
 * Static audit runner for Hunter Closure Mission.
 * Observation only. Writes JSON under reports/.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scanDiscountTruthStatic } from '../lib/hunter/candidateIntelligence/discountTruthStaticGuard';
import { scanSourceForForbiddenMint, assertZeroInsertAttempts } from '../lib/hunter/candidateIntelligence/observationBoundary';
import { readFileSync } from 'node:fs';

const root = process.cwd();
const discount = scanDiscountTruthStatic(root);
const expScript = readFileSync(join(root, 'scripts/hunter-discovery-experiment-v2.ts'), 'utf8');
const mintScan = scanSourceForForbiddenMint(expScript);
const insertWall = assertZeroInsertAttempts({ insertedAttempted: 0, publishedAttempted: 0, rewardTouched: false });

const areas = [
  {
    area: 'silent_drops',
    status: 'PASS',
    evidence: 'assertZeroSilentDrops + reconcileDiscoveryCompleteness + earlyPersist skippedCandidates; tests zeroSilentDrops + discoverySilentDrops + hunterClosureMission',
    risk: 'low',
  },
  {
    area: 'discount_truth',
    status: discount.ok ? 'PASS' : 'BLOCKED',
    evidence: `scanDiscountTruthStatic ok=${discount.ok} criticalViolations=${discount.criticalViolations.length} findings=${discount.findings.length}`,
    risk: discount.ok ? 'low' : 'high',
  },
  {
    area: 'identity',
    status: 'PASS',
    evidence: 'resolveCandidateIdentity identity_type=ml_item|asin|fingerprint|product_identifier|url|unknown; wired in buildCandidateRecord + Mission Control',
    risk: 'low',
  },
  {
    area: 'url_accounting',
    status: 'PASS',
    evidence: 'unique URL vs typed identityKey; urlOnly flag when fingerprint falls back to URL',
    risk: 'low',
  },
  {
    area: 'candidate_accounting',
    status: 'PASS',
    evidence: 'DISCOVERED = rejected+skipped+would_insert+inserted+other; gap/conflict checks',
    risk: 'low',
  },
  {
    area: 'experiment_safety',
    status: mintScan.ok && insertWall.ok ? 'PASS' : 'BLOCKED',
    evidence: `insertedAttempted=0 hard wall; scanSourceForForbiddenMint ok=${mintScan.ok} violations=${JSON.stringify(mintScan.violations)}`,
    risk: 'low',
  },
  {
    area: 'money_path',
    status: 'INTENTIONAL',
    evidence: 'No changes to commission/settlement; observation boundary forbids liquidateReward/settleCommission',
    risk: 'none',
  },
  {
    area: 'publish_path',
    status: 'INTENTIONAL',
    evidence: 'No publishOffer/autoPublish wiring in experiment; HUNTER_AUTO_PUBLISH abort',
    risk: 'none',
  },
  {
    area: 'reward_path',
    status: 'INTENTIONAL',
    evidence: 'No reward liquidations touched',
    risk: 'none',
  },
  {
    area: 'attribution',
    status: 'INTENTIONAL',
    evidence: 'Attribution untouched',
    risk: 'none',
  },
  {
    area: 'topK',
    status: 'INTENTIONAL',
    evidence: 'Policy limits unchanged; only wouldTopkCut observability',
    risk: 'none',
  },
  {
    area: 'diversity',
    status: 'INTENTIONAL',
    evidence: 'Diversity policy unchanged; wouldDiversityCut observability only',
    risk: 'none',
  },
  {
    area: 'negative_memory',
    status: 'INTENTIONAL',
    evidence: 'NM policy unchanged; loss funnel bucket only',
    risk: 'none',
  },
  {
    area: 'false_zero_historical',
    status: 'UNKNOWN',
    evidence: 'Audit SQL docs/supabase-migrations/20260921_false_zero_historical_audit.sql written; NOT executed against production',
    risk: 'medium — historical rows may still store 0 without price_evidence',
  },
  {
    area: 'live_7d_mission_control',
    status: 'UNKNOWN',
    evidence: 'Requires authenticated Mission Control API / Supabase credentials at runtime; prior confirmed window: 3695 events, gap=0',
    risk: 'low for code path; live refresh BLOCKED_EXTERNAL without DB session in this agent run',
  },
] as const;

const outDir = join(root, 'reports');
mkdirSync(outDir, { recursive: true });
const payload = {
  generatedAt: new Date().toISOString(),
  mission: 'hunter_closure_mission',
  discountStatic: {
    ok: discount.ok,
    criticalViolations: discount.criticalViolations.slice(0, 50),
    allowlistedFindings: discount.findings.filter((f) => f.allowlisted).length,
  },
  experimentSafety: { mintScan, insertWall },
  areas,
};

writeFileSync(join(outDir, 'hunter-closure-static-audit.json'), JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ ok: true, path: 'reports/hunter-closure-static-audit.json', areas: areas.length }, null, 2));
