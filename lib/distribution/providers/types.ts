/**
 * Provider-agnostic Distribution adapter contract.
 * Core drain/enqueue must not import Telegram HTTP details.
 */

export type DistributionPublishInput = {
  /** Opaque external chat/channel id from destination config. */
  externalDestinationKey: string;
  /** Env var name holding the bot token — never the token itself. */
  credentialRef: string | null;
  /** Rendered text body (already escaped by renderer). */
  text: string;
  /** Optional HTTPS image URL after SSRF validation; null = text-only. */
  imageUrl: string | null;
  /** Parse mode for Telegram (HTML preferred). */
  parseMode?: 'HTML' | 'MarkdownV2';
};

export type DistributionPublishSuccess = {
  ok: true;
  externalMessageId: string;
  provider: string;
  meta?: Record<string, unknown>;
};

export type DistributionPublishFailure = {
  ok: false;
  /** Definite failure path — may be retryable or terminal. */
  unknownOutcome?: false;
  retryable: boolean;
  code: string;
  message: string;
  /** True when staging credentials are missing — do not invent. */
  blockedExternalCredential?: boolean;
};

/**
 * C3: provider response ambiguous (timeout / lost response).
 * Must NOT be treated as FAILED or auto-retried — may have published externally.
 */
export type DistributionPublishUnknown = {
  ok: false;
  unknownOutcome: true;
  code: string;
  message: string;
};

export type DistributionPublishResult =
  | DistributionPublishSuccess
  | DistributionPublishFailure
  | DistributionPublishUnknown;

export type DistributionProviderAdapter = {
  readonly provider: 'telegram' | 'whatsapp' | 'web';
  publish(input: DistributionPublishInput): Promise<DistributionPublishResult>;
  /** Optional health probe — never logs secrets. */
  health?(credentialRef: string | null): Promise<{ ok: boolean; detail: string }>;
};
