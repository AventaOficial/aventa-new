import type { BotIngestConfig } from './config';

export type IngestRunBlock = 'paused' | 'disabled' | 'missing_bot_user';

/**
 * Misma puerta para cron API y ml_worker.
 * Pausado/disabled no inserta. No es un kill-switch por fuente caída.
 */
export function ingestRunBlockReason(opts: {
  pausedByOwner: boolean;
  enabled: boolean;
  botUserIdsForQuota: string[];
}): IngestRunBlock | null {
  if (opts.pausedByOwner) return 'paused';
  if (!opts.enabled) return 'disabled';
  if (opts.botUserIdsForQuota.length === 0) return 'missing_bot_user';
  return null;
}

export function ingestRunBlockFromConfig(
  config: Pick<BotIngestConfig, 'enabled' | 'botUserIdsForQuota'>,
  pausedByOwner: boolean
): IngestRunBlock | null {
  return ingestRunBlockReason({
    pausedByOwner,
    enabled: config.enabled,
    botUserIdsForQuota: config.botUserIdsForQuota,
  });
}
