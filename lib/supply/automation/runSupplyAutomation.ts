/**
 * S9 Supply Automation orchestrator.
 *
 * dry_run and execute share the SAME decision pipeline.
 * Only the final side effect (S7 pending write) differs.
 */

import { evaluateOpportunity } from '@/lib/supply/intelligence/evaluateOpportunity';
import {
  evaluateSupplyPolicy,
  resolveSupplyAutomationCaps,
  type SupplyDecision,
} from '@/lib/supply/policy';
import { isMachinePendingWriteEnabled } from '@/lib/bots/ingest/machineLiveInsertEligibility';
import { withMachinePendingWritesEnabled } from '@/lib/bots/ingest/machineInsertCanary';
import { loadBotIngestConfig, type BotIngestConfig } from '@/lib/bots/ingest/config';
import {
  buildParsedMetaFromOpportunity,
  writePendingViaS7Bridge,
} from '@/lib/supply/s7Bridge';
import { isProductionRuntime } from '@/lib/server/moneyPathFreeze';
import {
  buildDecisionFingerprint,
  bumpCode,
  emptyMetrics,
  type SupplyAutomationInput,
  type SupplyAutomationResult,
  type SupplyCandidateOutcome,
} from './types';
import { decision } from '@/lib/supply/policy/types';

export type RunSupplyAutomationDeps = {
  config?: BotIngestConfig;
  /** Injected for tests — default uses findDuplicateOfferByUrl when writing */
  checkDuplicate?: (url: string) => Promise<{
    isDuplicate: boolean;
    kind: string | null;
  }>;
  /** Injected write (default: writePendingViaS7Bridge) */
  writePending?: typeof writePendingViaS7Bridge;
  /** Injected evaluateOpportunity */
  evaluate?: typeof evaluateOpportunity;
  now?: () => Date;
};

async function defaultCheckDuplicate(url: string): Promise<{
  isDuplicate: boolean;
  kind: string | null;
}> {
  try {
    const { createServerClient } = await import('@/lib/supabase/server');
    const { findDuplicateOfferByUrl } = await import('@/lib/offers/findDuplicateOffer');
    const supabase = createServerClient();
    const dup = await findDuplicateOfferByUrl(supabase, url);
    if (!dup) return { isDuplicate: false, kind: null };
    return { isDuplicate: true, kind: dup.kind };
  } catch {
    // Fail closed: treat lookup failure as write-blocked later; here mark not duplicate
    // so policy can still run — write path will fail closed on DB errors.
    return { isDuplicate: false, kind: null };
  }
}

function fingerprintKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    return u.href.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Run S9 automation once. Never enables Distribution/Rewards/Settlement.
 * Execute mode scopes writes via withMachinePendingWritesEnabled.
 */
export async function runSupplyAutomation(
  input: SupplyAutomationInput,
  deps: RunSupplyAutomationDeps = {},
): Promise<SupplyAutomationResult> {
  const env = input.env ?? process.env;
  const started = (deps.now ?? (() => new Date))();
  const metrics = emptyMetrics();
  const outcomes: SupplyCandidateOutcome[] = [];
  const config = deps.config ?? loadBotIngestConfig('standard');
  const evaluate = deps.evaluate ?? evaluateOpportunity;
  const checkDuplicate = deps.checkDuplicate ?? defaultCheckDuplicate;
  const writePending = deps.writePending ?? writePendingViaS7Bridge;

  const caps = resolveSupplyAutomationCaps(env, input.cliCap);
  if (!caps) {
    const completed = (deps.now ?? (() => new Date))();
    const blocked = decision('INVALID_CONFIG', ['invalid_s9_caps_env']);
    bumpCode(metrics, 'INVALID_CONFIG');
    metrics.candidates_seen = input.candidates.length;
    return {
      runId: input.runId,
      mode: input.mode,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      metrics,
      outcomes: input.candidates.map((c) => ({
        candidateKey: c.candidateKey,
        sourceId: c.sourceId,
        url: c.opportunity.url,
        decision: blocked,
        policyDecision: blocked,
        evaluation: null,
        writeAttempted: false,
        writeSuccess: false,
        offerId: null,
        writeError: null,
        duplicateKind: null,
      })),
      decisionFingerprint: '',
    };
  }

  if (isProductionRuntime()) {
    const completed = (deps.now ?? (() => new Date))();
    const blocked = decision('PRODUCTION_BLOCKED', ['production_runtime']);
    bumpCode(metrics, 'PRODUCTION_BLOCKED');
    metrics.candidates_seen = input.candidates.length;
    return {
      runId: input.runId,
      mode: input.mode,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      metrics,
      outcomes: [],
      decisionFingerprint: buildDecisionFingerprint([]),
    };
  }

  const sliced = input.candidates.slice(0, caps.maxCandidatesPerRun);
  metrics.candidates_seen = sliced.length;

  let writesUsedThisRun = 0;
  const writesBySource = new Map<string, number>();
  /** In-run canonical URL de-dupe (two hunters → one opportunity). */
  const seenUrls = new Set<string>();

  const processOne = async (
    c: (typeof sliced)[0],
    machineWritesOn: boolean,
  ): Promise<SupplyCandidateOutcome> => {
    const url = (c.opportunity.canonicalUrl || c.opportunity.url || '').trim();
    const fp = fingerprintKey(url);

    let evaluation = null as Awaited<ReturnType<typeof evaluateOpportunity>> | null;
    let evaluationError: string | null = null;

    try {
      evaluation = await evaluate(c.opportunity, {
        skipAdapterFetch: input.skipAdapterFetch ?? true,
        forceDryRun: true,
        ingestConfig: config,
      });
      metrics.evaluated += 1;
    } catch (err) {
      evaluationError = err instanceof Error ? err.message : 's8_evaluate_threw';
    }

    let isDuplicate = false;
    let duplicateKind: string | null = null;

    if (url && seenUrls.has(fp)) {
      isDuplicate = true;
      duplicateKind = 'in_run_canonical';
    }

    if (!isDuplicate && url) {
      const dup = await checkDuplicate(url);
      if (dup.isDuplicate) {
        isDuplicate = true;
        duplicateKind = dup.kind;
      }
    }

    const sourceWrites = writesBySource.get(c.sourceId) ?? 0;

    const policyDecision: SupplyDecision = evaluateSupplyPolicy({
      evaluation,
      evaluationError,
      isDuplicate,
      duplicateKind,
      writesUsedThisRun,
      writesUsedThisSource: sourceWrites,
      sourceId: c.sourceId,
      cliCap: input.cliCap,
      env,
      mode: input.mode,
      machinePendingWritesEnabled:
        input.mode === 'execute' ? machineWritesOn : undefined,
    });

    bumpCode(metrics, policyDecision.code);

    const s8Echo = {
      decision: policyDecision.s8Decision,
      score: policyDecision.s8Score,
      confidence: policyDecision.s8Confidence,
    };

    const outcome: SupplyCandidateOutcome = {
      candidateKey: c.candidateKey,
      sourceId: c.sourceId,
      url,
      decision: policyDecision,
      policyDecision,
      evaluation,
      writeAttempted: false,
      writeSuccess: false,
      offerId: null,
      writeError: null,
      duplicateKind,
    };

    if (!policyDecision.eligible) {
      return outcome;
    }

    // Reserve URL for subsequent candidates (dry and live)
    if (url) seenUrls.add(fp);

    if (input.mode !== 'execute') {
      // Dry-run: count as would-write against caps for equivalence of budget decisions
      writesUsedThisRun += 1;
      writesBySource.set(c.sourceId, sourceWrites + 1);
      return outcome;
    }

    const meta = evaluation
      ? buildParsedMetaFromOpportunity({
          candidate: c.opportunity,
          evaluation,
          sourceId: c.sourceId,
          hunterId: c.hunterId,
        })
      : null;

    if (!meta) {
      outcome.decision = decision(
        'INVALID_PROVENANCE',
        ['cannot_build_parsed_meta'],
        s8Echo,
      );
      return outcome;
    }

    outcome.writeAttempted = true;
    metrics.write_attempted += 1;

    try {
      const writeResult = await writePending({
        config,
        meta,
        ingestSource: 's9_supply_automation',
        ingestSourceDetail: `${c.sourceId}:${c.hunterId ?? 'unknown'}`,
        moderatorNote: `[s9] run=${input.runId} key=${c.candidateKey}`,
        ingestScore: evaluation?.score.value,
        requireDedicatedAuthor: true,
      });

      if (writeResult.ok === true) {
        outcome.writeSuccess = true;
        outcome.offerId = writeResult.offerId;
        metrics.write_success += 1;
        writesUsedThisRun += 1;
        writesBySource.set(c.sourceId, sourceWrites + 1);
      } else if ('duplicate' in writeResult && writeResult.duplicate) {
        outcome.decision = decision(
          'DUPLICATE',
          [`duplicate:${writeResult.duplicateKind}`],
          s8Echo,
        );
        outcome.duplicateKind = writeResult.duplicateKind;
        metrics.write_failed += 1;
      } else {
        const err =
          'error' in writeResult
            ? writeResult.error
            : 'write_failed';
        const code =
          'code' in writeResult && writeResult.code === 'INVALID_AUTHOR'
            ? 'INVALID_AUTHOR'
            : 'WRITE_BLOCKED';
        outcome.writeError = err;
        outcome.decision = decision(code, [err], s8Echo);
        metrics.write_failed += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'write_threw';
      outcome.writeError = msg;
      outcome.decision = decision('WRITE_BLOCKED', [msg], s8Echo);
      metrics.write_failed += 1;
    }

    return outcome;
  };

  if (input.mode === 'execute') {
    await withMachinePendingWritesEnabled(async () => {
      const on = isMachinePendingWriteEnabled();
      for (const c of sliced) {
        outcomes.push(await processOne(c, on));
      }
    });
  } else {
    for (const c of sliced) {
      outcomes.push(await processOne(c, false));
    }
  }

  const completed = (deps.now ?? (() => new Date))();
  return {
    runId: input.runId,
    mode: input.mode,
    startedAt: started.toISOString(),
    completedAt: completed.toISOString(),
    metrics,
    outcomes,
    decisionFingerprint: buildDecisionFingerprint(outcomes),
  };
}
