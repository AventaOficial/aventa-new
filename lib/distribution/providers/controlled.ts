/**
 * Controlled Distribution provider — deterministic staging/test scenarios.
 * Never calls Telegram HTTP. Never logs secrets.
 */

import type {
  DistributionProviderAdapter,
  DistributionPublishInput,
  DistributionPublishResult,
} from './types';

export type ControlledProviderScenario =
  | 'success'
  | 'definite_failure'
  | 'retryable_failure'
  | 'unknown_outcome';

export type ControlledProviderOptions = {
  scenario: ControlledProviderScenario | (() => ControlledProviderScenario);
  /** Stable external id for success (default: controlled-{n}). */
  externalMessageId?: string;
  onPublish?: (input: DistributionPublishInput) => void;
};

/**
 * Adapter injectable via getDistributionProviderAdapter(..., { overrides }).
 */
export function createControlledDistributionAdapter(
  options: ControlledProviderOptions,
): DistributionProviderAdapter {
  let successCount = 0;
  return {
    provider: 'telegram',
    async publish(input: DistributionPublishInput): Promise<DistributionPublishResult> {
      options.onPublish?.(input);
      const scenario =
        typeof options.scenario === 'function' ? options.scenario() : options.scenario;

      switch (scenario) {
        case 'success': {
          successCount += 1;
          const id =
            options.externalMessageId ?? `controlled-msg-${successCount}`;
          return {
            ok: true,
            externalMessageId: id,
            provider: 'telegram',
            meta: { controlled: true, scenario: 'success' },
          };
        }
        case 'definite_failure':
          return {
            ok: false,
            retryable: false,
            code: 'controlled_definite_failure',
            message: 'controlled definite failure (no side effect)',
          };
        case 'retryable_failure':
          return {
            ok: false,
            retryable: true,
            code: 'controlled_retryable_failure',
            message: 'controlled retryable failure (no side effect)',
          };
        case 'unknown_outcome':
          return {
            ok: false,
            unknownOutcome: true,
            code: 'controlled_ambiguous_timeout',
            message: 'controlled ambiguous timeout (ACK unreliable)',
          };
        default: {
          const _exhaustive: never = scenario;
          return {
            ok: false,
            retryable: false,
            code: 'controlled_invalid_scenario',
            message: String(_exhaustive),
          };
        }
      }
    },
    async health() {
      return { ok: true, detail: 'controlled_adapter' };
    },
  };
}
