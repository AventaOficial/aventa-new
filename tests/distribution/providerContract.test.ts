/**
 * Distribution provider adapter contract — structural + UNKNOWN_OUTCOME invariants.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISTRIBUTION_UNKNOWN_OUTCOME_SEMANTICS,
  assertDistributionProviderAdapter,
  isDistributionPublishFailure,
  isDistributionPublishSuccess,
  isDistributionPublishUnknown,
  validateDistributionProviderAdapter,
  validateDistributionPublishResult,
  type DistributionProviderAdapterContract,
} from '@/lib/distribution/providerContract';
import { createControlledDistributionAdapter } from '@/lib/distribution/providers/controlled';
import { getDistributionProviderAdapter } from '@/lib/distribution/providers/registry';
import { createTelegramAdapter } from '@/lib/distribution/providers/telegram/adapter';
import type { DistributionProviderAdapter } from '@/lib/distribution/providers/types';

describe('Distribution provider contract — adapter shape', () => {
  it('telegram adapter satisfies structural contract', () => {
    const adapter = createTelegramAdapter({ env: {} });
    const result = validateDistributionProviderAdapter(adapter);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.adapter.provider).toBe('telegram');
      expect(typeof result.adapter.publish).toBe('function');
    }
    expect(() => assertDistributionProviderAdapter(adapter)).not.toThrow();
  });

  it('controlled adapter satisfies structural contract', () => {
    const adapter = createControlledDistributionAdapter({ scenario: 'success' });
    expect(validateDistributionProviderAdapter(adapter).ok).toBe(true);
  });

  it('registry telegram factory returns valid adapter', () => {
    const adapter = getDistributionProviderAdapter('telegram', { env: {} });
    expect(adapter).not.toBeNull();
    expect(validateDistributionProviderAdapter(adapter).ok).toBe(true);
  });

  it('rejects adapter missing publish or provider', () => {
    expect(validateDistributionProviderAdapter(null).ok).toBe(false);
    expect(validateDistributionProviderAdapter({ provider: 'telegram' }).ok).toBe(false);
    expect(
      validateDistributionProviderAdapter({
        publish: async () => ({ ok: true, externalMessageId: '1', provider: 'telegram' }),
      }).ok,
    ).toBe(false);
    expect(
      validateDistributionProviderAdapter({
        provider: 'not-a-provider',
        publish: async () => ({ ok: true, externalMessageId: '1', provider: 'x' }),
      }).ok,
    ).toBe(false);
  });

  it('compile-time contract type accepts DistributionProviderAdapter', () => {
    const adapter: DistributionProviderAdapterContract = createTelegramAdapter({ env: {} });
    expect(adapter.provider).toBe('telegram');
  });
});

describe('Distribution provider contract — publish result shapes', () => {
  it('success result validates', () => {
    expect(
      validateDistributionPublishResult({
        ok: true,
        externalMessageId: '42',
        provider: 'telegram',
      }).ok,
    ).toBe(true);
  });

  it('definite failure validates', () => {
    const result = {
      ok: false as const,
      retryable: true,
      code: 'rate_limited',
      message: 'slow down',
    };
    expect(validateDistributionPublishResult(result).ok).toBe(true);
    expect(isDistributionPublishFailure(result)).toBe(true);
    expect(isDistributionPublishUnknown(result)).toBe(false);
  });

  it('UNKNOWN_OUTCOME validates and rejects retryable', () => {
    const unknown = {
      ok: false as const,
      unknownOutcome: true as const,
      code: 'timeout',
      message: 'lost response',
    };
    expect(validateDistributionPublishResult(unknown).ok).toBe(true);
    expect(isDistributionPublishUnknown(unknown)).toBe(true);
    expect(isDistributionPublishFailure(unknown)).toBe(false);

    const bad = {
      ok: false as const,
      unknownOutcome: true as const,
      retryable: true,
      code: 'timeout',
      message: 'bad',
    };
    expect(validateDistributionPublishResult(bad).ok).toBe(false);
  });

  it('controlled scenarios return contract-valid results', async () => {
    for (const scenario of [
      'success',
      'definite_failure',
      'retryable_failure',
      'unknown_outcome',
    ] as const) {
      const adapter = createControlledDistributionAdapter({ scenario });
      const result = await adapter.publish({
        externalDestinationKey: '-1001',
        credentialRef: null,
        text: 'test',
        imageUrl: null,
      });
      expect(validateDistributionPublishResult(result).ok).toBe(true);
      if (scenario === 'unknown_outcome') {
        expect(isDistributionPublishUnknown(result)).toBe(true);
      }
      if (scenario === 'success') {
        expect(isDistributionPublishSuccess(result)).toBe(true);
      }
    }
  });

  it('telegram timeout maps to UNKNOWN (not retryable failure)', async () => {
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_A: '123:ABC' },
      fetchImpl: vi.fn(async () => {
        throw new Error('timeout');
      }) as never,
    });
    const result = await adapter.publish({
      externalDestinationKey: '-1001',
      credentialRef: 'TELEGRAM_BOT_TOKEN_A',
      text: 'hi',
      imageUrl: null,
    });
    expect(validateDistributionPublishResult(result).ok).toBe(true);
    expect(isDistributionPublishUnknown(result)).toBe(true);
  });
});

describe('Distribution provider contract — boundaries', () => {
  it('documents UNKNOWN_OUTCOME semantics for operators', () => {
    expect(DISTRIBUTION_UNKNOWN_OUTCOME_SEMANTICS.notEquivalentTo).toContain('failed');
    expect(DISTRIBUTION_UNKNOWN_OUTCOME_SEMANTICS.notEquivalentTo).toContain('retryable');
    expect(DISTRIBUTION_UNKNOWN_OUTCOME_SEMANTICS.drainBehavior).toMatch(/unknown_outcome/);
  });

  it('drain uses markPublishingUnknownOutcome for adapter ambiguity', () => {
    const drain = readFileSync(join(process.cwd(), 'lib/distribution/drain.ts'), 'utf8');
    expect(drain).toMatch(/unknownOutcome === true/);
    expect(drain).toMatch(/markPublishingUnknownOutcome/);
    expect(drain).not.toMatch(/releaseUnknownOutcomeToRetryable/);
  });

  it('providerContract does not import supply or money', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/distribution/providerContract.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/hunter_supply|affiliate_ledger|creator_rewards/i);
    expect(src).not.toMatch(/api\.telegram\.org/);
  });
});
