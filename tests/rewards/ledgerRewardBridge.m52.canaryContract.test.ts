/**
 * M5.2 — Contract guards for settlement → reward bridge E2E canary.
 * Staging evidence lives in scripts/m5-2-settlement-reward-bridge-canary.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const CANARY = join(ROOT, 'scripts/m5-2-settlement-reward-bridge-canary.ts');
const BRIDGE = join(ROOT, 'lib/rewards/ledgerRewardBridge');
const SETTLE = join(ROOT, 'lib/economy/settlement/settleCommission.ts');

describe('M5.2 canary contract', () => {
  it('canary script exists and uses architecture D only', () => {
    expect(existsSync(CANARY)).toBe(true);
    const src = readFileSync(CANARY, 'utf8');
    expect(src).toMatch(/processLedgerRewardAttempt/);
    expect(src).toMatch(/scheduleLedgerRewardAttempt/);
    expect(src).toMatch(/reconcileLedgerRewardBridge/);
    expect(src).toMatch(/settleCommission/);
    expect(src).not.toMatch(/settleCommission\([^)]*\)[\s\S]{0,200}createRewardFromLedgerEntry/);
    expect(src).not.toMatch(/payoutIntent|executeProvider|confirmPayoutIntent/);
    expect(src).toMatch(/anonymous_click_not_auto_rewardable/);
    expect(src).toMatch(/offer_not_participating/);
    expect(src).toMatch(/0e12ab0d-a285-46eb-90e4-e7ff7dac6146/);
    expect(src).toMatch(/restoreWave3FailClosedFlags/);
  });

  it('settleCommission still never invokes reward bridge', () => {
    const src = readFileSync(SETTLE, 'utf8');
    expect(src).not.toMatch(/from ['"]@\/lib\/rewards\/ledgerRewardBridge/);
    expect(src).not.toMatch(/tryCreateRewardFromLedgerRow\s*\(/);
    expect(src).not.toMatch(/createRewardFromLedgerEntry\s*\(/);
    expect(src).toMatch(/createdCreatorReward:\s*false/);
  });

  it('bridge still delegates only to tryCreateRewardFromLedgerRow', () => {
    const src = readFileSync(join(BRIDGE, 'processLedgerRewardAttempt.ts'), 'utf8');
    expect(src).toMatch(/tryCreateRewardFromLedgerRow/);
    expect(src).not.toMatch(/resolveCommissionAttribution/);
    expect(src).not.toMatch(/payoutIntent|createManualRewardPayout/);
  });
});
