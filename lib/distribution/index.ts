/**
 * Distribution Engine — P0-D3 exports.
 * Provider-agnostic core + Telegram adapter. Flag default OFF.
 * Drain/adapters never run when DISTRIBUTION_ENGINE_ENABLED is unset/false.
 */

export * from './constants';
export * from './types';
export * from './idempotency';
export * from './eligibility';
export * from './routing';
export * from './events';
export * from './enqueue';
export * from './safety';
export * from './trackingContext';
export * from './claim';
export * from './drain';
export * from './reclaim';
export * from './opsSurface';
export * from './cronSafety';
export * from './hop';
export * from './siteUrl';
export * from './render/escape';
export * from './render/telegramMessage';
export * from './security/urls';
export * from './providers/types';
export * from './providers/registry';
export * from './providerContract';
export { createTelegramAdapter } from './providers/telegram/adapter';
export { createControlledDistributionAdapter } from './providers/controlled';
export type { ControlledProviderScenario } from './providers/controlled';
export * from './stagingCanary';
export {
  resolveTelegramBotToken,
  redactTelegramSecrets,
} from './providers/telegram/credentials';
