/**
 * Strong discovery completeness reconciliation.
 * DISCOVERED = PERSISTED_TERMINAL + (optional explicit skipped already in set)
 * Every URL-bearing row must have exactly one terminal decision.
 */

export type ReconTerminalRow = {
  url: string;
  decision: string;
  reasonCode?: string | null;
  stage?: string | null;
};

export type CompletenessReconciliation = {
  ok: boolean;
  discovered: number;
  persisted: number;
  rejected: number;
  skipped: number;
  wouldInsert: number;
  inserted: number;
  other: number;
  gap: number;
  duplicateUrls: string[];
  conflictingDecisions: Array<{ url: string; decisions: string[] }>;
  missingTerminal: string[];
  decisionBreakdown: Record<string, number>;
  formula: string;
  note: string;
};

const REJECT_PREFIX = 'REJECTED_';
const SKIP_REASONS = /skip|truncat|pool|shortlist|diversity|budget|discovery:/i;

function classifyBucket(decision: string): 'rejected' | 'skipped' | 'would_insert' | 'inserted' | 'other' {
  const d = decision || '';
  if (d === 'WOULD_INSERT') return 'would_insert';
  if (d === 'INSERTED_PENDING' || d === 'PUBLISHED') return 'inserted';
  if (d === 'DISCOVERED') return 'other'; // non-terminal early persist
  if (d.startsWith(REJECT_PREFIX) || d === 'DUPLICATE' || d === 'FAILED') {
    if (SKIP_REASONS.test(d) || d === 'REJECTED_BUDGET' || d === 'REJECTED_DIVERSITY') {
      return d === 'REJECTED_BUDGET' || d === 'REJECTED_DIVERSITY' || d.includes('POOL')
        ? 'skipped'
        : 'rejected';
    }
    return 'rejected';
  }
  if (d === 'NEEDS_REVIEW' || d === 'WATCHLIST') return 'other';
  return 'other';
}

/**
 * Reconcile a flat list of URL-bearing terminal candidates.
 * Early DISCOVERED-only rows without overwrite count as missingTerminal if expectedTerminal=true.
 */
export function reconcileDiscoveryCompleteness(input: {
  rows: readonly ReconTerminalRow[];
  /** When true, DISCOVERED alone is not a valid terminal (must be overwritten). */
  requireTerminalBeyondDiscovered?: boolean;
}): CompletenessReconciliation {
  const byUrl = new Map<string, string[]>();
  const decisionBreakdown: Record<string, number> = {};

  for (const row of input.rows) {
    const url = (row.url || '').trim().toLowerCase();
    if (!url) continue;
    const list = byUrl.get(url) ?? [];
    list.push(row.decision);
    byUrl.set(url, list);
    decisionBreakdown[row.decision] = (decisionBreakdown[row.decision] ?? 0) + 1;
  }

  const duplicateUrls: string[] = [];
  const conflictingDecisions: Array<{ url: string; decisions: string[] }> = [];
  const missingTerminal: string[] = [];

  let rejected = 0;
  let skipped = 0;
  let wouldInsert = 0;
  let inserted = 0;
  let other = 0;

  for (const [url, decisions] of byUrl) {
    const unique = [...new Set(decisions)];
    if (decisions.length > 1) duplicateUrls.push(url);
    // Compatible: DISCOVERED then terminal overwrite is OK if only one terminal remains preferred
    const terminals = unique.filter((d) => d !== 'DISCOVERED');
    if (terminals.length > 1) {
      conflictingDecisions.push({ url, decisions: unique });
    }
    const effective =
      terminals[terminals.length - 1] ??
      (input.requireTerminalBeyondDiscovered ? null : unique[unique.length - 1] ?? null);
    if (!effective) {
      missingTerminal.push(url);
      continue;
    }
    if (input.requireTerminalBeyondDiscovered && effective === 'DISCOVERED') {
      missingTerminal.push(url);
      continue;
    }
    switch (classifyBucket(effective)) {
      case 'rejected':
        rejected += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'would_insert':
        wouldInsert += 1;
        break;
      case 'inserted':
        inserted += 1;
        break;
      default:
        other += 1;
        break;
    }
  }

  const discovered = byUrl.size;
  const persisted = discovered; // each URL has a row in the input set
  const accounted = rejected + skipped + wouldInsert + inserted + other;
  const gap = discovered - accounted;

  const ok =
    gap === 0 &&
    conflictingDecisions.length === 0 &&
    missingTerminal.length === 0 &&
    discovered === accounted;

  return {
    ok,
    discovered,
    persisted,
    rejected,
    skipped,
    wouldInsert,
    inserted,
    other,
    gap,
    duplicateUrls: duplicateUrls.slice(0, 50),
    conflictingDecisions: conflictingDecisions.slice(0, 50),
    missingTerminal: missingTerminal.slice(0, 50),
    decisionBreakdown,
    formula: 'DISCOVERED(unique_url) = rejected + skipped + would_insert + inserted + other',
    note: ok
      ? 'Completeness OK — every URL-bearing candidate has one effective terminal bucket.'
      : `Completeness gap=${gap} conflicts=${conflictingDecisions.length} missingTerminal=${missingTerminal.length}`,
  };
}
