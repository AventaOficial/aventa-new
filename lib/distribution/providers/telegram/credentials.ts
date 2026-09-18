/**
 * Resolve bot token from credential_ref env name only.
 * Never accepts raw tokens as credential_ref values that look like tokens in DB seeds.
 */

export function resolveTelegramBotToken(
  credentialRef: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; token: string; ref: string } | { ok: false; code: string; message: string } {
  const ref = (credentialRef ?? '').trim();
  if (!ref) {
    return { ok: false, code: 'missing_credential_ref', message: 'credential_ref empty' };
  }
  // Reject if someone stored a token-looking string as the ref itself
  if (ref.includes(':') && /^\d+:/.test(ref)) {
    return {
      ok: false,
      code: 'credential_ref_looks_like_token',
      message: 'credential_ref must be an env var name, not a bot token',
    };
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(ref)) {
    return {
      ok: false,
      code: 'invalid_credential_ref',
      message: 'credential_ref must be UPPER_SNAKE env name',
    };
  }
  const token = (env[ref] ?? '').trim();
  if (!token) {
    return {
      ok: false,
      code: 'BLOCKED_EXTERNAL_CREDENTIAL',
      message: `env ${ref} unset — staging Telegram not provisioned`,
    };
  }
  return { ok: true, token, ref };
}

/** Redact token-like substrings from log strings. */
export function redactTelegramSecrets(text: string): string {
  return text.replace(/\d{6,}:[A-Za-z0-9_-]{20,}/g, '[REDACTED_BOT_TOKEN]');
}
