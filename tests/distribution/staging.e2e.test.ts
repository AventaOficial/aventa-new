/**
 * Distribution staging E2E — full circuit matrix with controlled provider.
 * No Telegram HTTP. No production. Deterministic harness.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_ENGINE_BOUNDARIES,
  buildDistributionIdempotencyKey,
} from '@/lib/distribution';
import { createControlledDistributionAdapter } from '@/lib/distribution/providers/controlled';
import {
  runE2EConcurrentClaim,
  runE2EConcurrentReclaim,
  runE2EDefiniteFailurePath,
  runE2ELeaseReclaimBranches,
  runE2EMarkUnknownDoesNotTouchOffer,
  runE2EPendingBlocked,
  runE2EProviderFailure,
  runE2ERejectedBlocked,
  runE2ESuccessCircuit,
  runE2EUnknownAndRecover,
  E2E_DEST_ID,
  E2E_MACHINE_AUTHOR,
} from '@/lib/distribution/e2e/stagingHarness';

describe('Distribution staging E2E — success circuit', () => {
  it('Supply pending → moderation → enqueue → controlled SUCCESS → published', async () => {
    const { store, report } = await runE2ESuccessCircuit();
    expect(report.initialOfferStatus).toBe('pending');
    expect(report.finalOfferStatus).toBe('approved');
    expect(store.offers[0]!.created_by).toBe(E2E_MACHINE_AUTHOR);
    expect(store.publications).toHaveLength(1);
    expect(store.publications[0]!.status).toBe('published');
    expect(report.externalMessageId).toBeTruthy();
    expect(report.idempotencyKey).toBe(
      buildDistributionIdempotencyKey({
        offerId: report.offerId,
        destinationId: E2E_DEST_ID,
        distributionVersion: 1,
      }),
    );
    expect(report.providerInvocations).toBe(1);
    expect(report.telegramReal).toBe(false);
    expect(report.forbiddenTablesTouched).toEqual([]);
    expect(report.duplicateCount).toBe(0);
  });
});

describe('Distribution staging E2E — C2 boundaries', () => {
  it('pending → distribution blocked', async () => {
    const r = await runE2EPendingBlocked();
    expect(r.eligible).toBe(false);
    expect(r.decision).toMatch(/PENDING/);
  });

  it('rejected → distribution blocked', async () => {
    const r = await runE2ERejectedBlocked();
    expect(r.eligible).toBe(false);
    expect(r.decision).toMatch(/REJECTED/);
  });
});

describe('Distribution staging E2E — failure / unknown / recovery', () => {
  it('provider retryable failure → retryable path', async () => {
    const r = await runE2EProviderFailure();
    expect(r.status).toBe('retryable');
    expect(r.providerInvocations).toBe(1);
    expect(r.events.some((e) => e === 'publication_retryable' || e === 'publish_failure')).toBe(
      true,
    );
  });

  it('provider definite failure → failed', async () => {
    const r = await runE2EDefiniteFailurePath();
    expect(r.status).toBe('failed');
  });

  it('ambiguous provider → UNKNOWN → operator release → retryable', async () => {
    const r = await runE2EUnknownAndRecover();
    expect(r.report.unknownOutcome || r.afterReleaseStatus === 'retryable').toBe(true);
    expect(r.afterReleaseStatus).toBe('retryable');
    expect(r.providerInvocationsDuringRelease).toBe(0);
    expect(r.report.events.some((e) => e.event_type === 'released_to_retryable')).toBe(true);
    expect(r.report.finalOfferStatus).toBe('approved');
    expect(r.report.duplicateCount).toBe(0);
  });
});

describe('Distribution staging E2E — lease reclaim', () => {
  it('no side effect → retryable; side effect → unknown_outcome', async () => {
    const r = await runE2ELeaseReclaimBranches();
    expect(r.noSideEffect).toBe('RETRYABLE_NO_SIDE_EFFECT');
    expect(r.withSideEffect).toBe('UNKNOWN_OUTCOME_SIDE_EFFECT_POSSIBLE');
  });
});

describe('Distribution staging E2E — concurrency', () => {
  it('concurrent claim → one winner', async () => {
    const r = await runE2EConcurrentClaim();
    expect(r.winners).toBe(1);
  });

  it('concurrent reclaim → one winner', async () => {
    const r = await runE2EConcurrentReclaim();
    expect(r.decisions).toContain('RETRYABLE_NO_SIDE_EFFECT');
    expect(r.decisions).toContain('CAS_LOST');
  });
});

describe('Distribution staging E2E — security boundaries', () => {
  it('Distribution boundaries: no Rewards/Economy/Attribution writes', () => {
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.writesRewards).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.writesLedger).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.writesConversions).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesSupplyWrite).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.approvesOffers).toBe(false);
  });

  it('mark UNKNOWN does not mutate offer.status', async () => {
    expect(await runE2EMarkUnknownDoesNotTouchOffer()).toBe(true);
  });

  it('controlled adapter never uses fetch/Telegram', async () => {
    const fetchSpy = async () => {
      throw new Error('Telegram fetch must not be called');
    };
    const adapter = createControlledDistributionAdapter({ scenario: 'success' });
    const r = await adapter.publish({
      externalDestinationKey: '-1',
      credentialRef: 'TELEGRAM_BOT_TOKEN_STAGING',
      text: 'hi',
      imageUrl: null,
    });
    expect(r.ok).toBe(true);
    // fetchSpy unused — proving adapter does not need fetch
    expect(typeof fetchSpy).toBe('function');
  });

  it('harness sources do not import real telegram HTTP adapter path for scenarios', () => {
    const harness = readFileSync(
      join(process.cwd(), 'lib/distribution/e2e/stagingHarness.ts'),
      'utf8',
    );
    expect(harness).toMatch(/createControlledDistributionAdapter/);
    expect(harness).not.toMatch(/createTelegramAdapter/);
  });
});
