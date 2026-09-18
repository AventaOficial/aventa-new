import type { DistributionProvider } from '../types';
import type { DistributionProviderAdapter } from './types';
import { createTelegramAdapter } from './telegram/adapter';

export type ProviderRegistryOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Test injection. */
  overrides?: Partial<Record<DistributionProvider, DistributionProviderAdapter>>;
};

export function getDistributionProviderAdapter(
  provider: DistributionProvider,
  options?: ProviderRegistryOptions,
): DistributionProviderAdapter | null {
  if (options?.overrides?.[provider]) return options.overrides[provider]!;
  if (provider === 'telegram') {
    return createTelegramAdapter({ env: options?.env, fetchImpl: options?.fetchImpl });
  }
  // WhatsApp / web — not implemented in P0-D3
  return null;
}
