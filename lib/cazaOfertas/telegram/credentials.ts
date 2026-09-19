/**
 * CazaOfertasss — Credenciales Telegram (server-only).
 *
 * El token se resuelve por NOMBRE de env var. Nunca se serializa al dominio
 * ni a la tarjeta. La redaction evita filtrar el token en mensajes de error.
 */

import { CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV } from '../constants';
import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';

const TOKEN_PATTERN = /^[0-9]{6,12}:[A-Za-z0-9_-]{20,}$/;

export function redactTelegramSecrets(text: string, token?: string): string {
  let out = text;
  if (token && token.length > 8) {
    out = out.split(token).join('[REDACTED_TELEGRAM_TOKEN]');
  }
  // Patrón genérico bot token por si el mensaje lo contiene parcialmente.
  out = out.replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_TELEGRAM_TOKEN]');
  return out;
}

export function resolveCazaTelegramBotToken(
  envVarName: string = CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV,
  env: NodeJS.ProcessEnv = process.env
): CazaResult<{ token: string; credentialRef: string }> {
  if (!/^[A-Z][A-Z0-9_]{3,64}$/.test(envVarName)) {
    return failResult(['telegram.credential_ref_invalid']);
  }
  const raw = env[envVarName];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return failResult(['telegram.credential_missing']);
  }
  const token = raw.trim();
  if (!TOKEN_PATTERN.test(token)) {
    return failResult(['telegram.credential_malformed']);
  }
  return okResult({ token, credentialRef: envVarName });
}
