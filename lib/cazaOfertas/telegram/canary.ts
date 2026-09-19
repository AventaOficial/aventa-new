/**
 * CazaOfertasss — Gate canary de publicación Telegram.
 *
 * Fail-closed: sin env canary, sin allowlist o sin canal permitido ⇒ no publica.
 * `CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled` permanece false.
 */

import {
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV,
  CAZAOFERTAS_TELEGRAM_CANARY_ENV,
} from '../constants';
import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import { TELEGRAM_CHANNEL_PATTERN } from '../tracking/publication';

export interface TelegramCanaryGate {
  readonly mode: 'canary';
  readonly allowedChannels: readonly string[];
  readonly credentialEnvVar: string;
}

export function parseCanaryChannelAllowlist(raw: string | undefined): readonly string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => TELEGRAM_CHANNEL_PATTERN.test(s));
}

function envVarPresent(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Resuelve el gate canary. Nunca habilita producción automática.
 */
export function resolveTelegramCanaryGate(
  env: NodeJS.ProcessEnv = process.env
): CazaResult<TelegramCanaryGate> {
  if (CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled) {
    return failResult(['canary.production_flag_must_remain_false']);
  }
  if (CAZAOFERTAS_PUBLICATION_BOUNDARY.autoPublishEnabled) {
    return failResult(['canary.auto_publish_must_remain_false']);
  }
  if (env[CAZAOFERTAS_TELEGRAM_CANARY_ENV] !== '1') {
    return failResult(['canary.env_disabled']);
  }

  const allowedChannels = parseCanaryChannelAllowlist(
    env[CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV]
  );
  if (allowedChannels.length === 0) {
    return failResult(['canary.channel_allowlist_empty']);
  }

  if (!envVarPresent(env, CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV)) {
    return failResult(['canary.bot_token_missing']);
  }

  return okResult({
    mode: 'canary',
    allowedChannels,
    credentialEnvVar: CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  });
}

export function assertChannelAllowedByCanary(
  gate: TelegramCanaryGate,
  channel: string
): CazaResult<true> {
  if (!gate.allowedChannels.includes(channel)) {
    return failResult([`canary.channel_not_allowlisted:${channel}`]);
  }
  return okResult(true);
}
