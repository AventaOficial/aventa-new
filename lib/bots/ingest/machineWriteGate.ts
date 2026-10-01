/**
 * Deterministic machine-write predicate (staging canary documentation + tests).
 * Mirrors assertMachineOfferWriteAuthorized + externalWorker dryRun gate.
 */

export type MachineWriteGateInput = {
  vercelEnv: string | undefined | null;
  nodeEnv: string | undefined | null;
  botIngestMachinePendingWrites: string | undefined | null;
  workerDiscoveryOnlyOrDryRun: boolean;
};

export type MachineWriteGateResult = {
  allowed: boolean;
  productionBlocked: boolean;
  writesFlagOn: boolean;
  dryRun: boolean;
  blockingReason:
    | null
    | 'PRODUCTION_BLOCKED'
    | 'DRY_RUN'
    | 'MACHINE_WRITES_DISABLED';
  explanation: string;
};

function isTruthyFlag(raw: string | undefined | null): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isProductionFromEnv(vercelEnv: string | null | undefined, nodeEnv: string | null | undefined): boolean {
  const ve = (vercelEnv ?? '').trim().toLowerCase();
  if (ve === 'production') return true;
  if (ve === 'preview' || ve === 'development') return false;
  return (nodeEnv ?? '').trim().toLowerCase() === 'production';
}

/**
 * Write is allowed only when ALL of:
 *   !productionRuntime
 *   BOT_INGEST_MACHINE_PENDING_WRITES truthy
 *   !dryRun (WORKER_DISCOVERY_ONLY ≠ 1)
 */
export function evaluateMachineWriteGate(input: MachineWriteGateInput): MachineWriteGateResult {
  const productionBlocked = isProductionFromEnv(input.vercelEnv, input.nodeEnv);
  const writesFlagOn = isTruthyFlag(input.botIngestMachinePendingWrites);
  const dryRun = input.workerDiscoveryOnlyOrDryRun === true;

  if (dryRun) {
    return {
      allowed: false,
      productionBlocked,
      writesFlagOn,
      dryRun: true,
      blockingReason: 'DRY_RUN',
      explanation:
        'WORKER_DISCOVERY_ONLY/dryRun=true — observation only (would_insert), no offers.pending mint',
    };
  }
  if (productionBlocked) {
    return {
      allowed: false,
      productionBlocked: true,
      writesFlagOn,
      dryRun: false,
      blockingReason: 'PRODUCTION_BLOCKED',
      explanation:
        'VERCEL_ENV=production (or NODE_ENV=production without preview) → assertMachineOfferWriteAuthorized fails closed',
    };
  }
  if (!writesFlagOn) {
    return {
      allowed: false,
      productionBlocked: false,
      writesFlagOn: false,
      dryRun: false,
      blockingReason: 'MACHINE_WRITES_DISABLED',
      explanation: 'BOT_INGEST_MACHINE_PENDING_WRITES not set to 1|true|yes',
    };
  }
  return {
    allowed: true,
    productionBlocked: false,
    writesFlagOn: true,
    dryRun: false,
    blockingReason: null,
    explanation:
      'Staging/non-prod + writes ON + !dryRun → machine mint of offers.pending authorized',
  };
}
