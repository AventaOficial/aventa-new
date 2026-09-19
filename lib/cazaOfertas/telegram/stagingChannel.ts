/**
 * Canal Telegram de staging canary (soak P0-D3).
 * Allowlist cerrada: jamás aceptar chat_id arbitrario de input externo.
 */
export const CAZA_STAGING_TELEGRAM_CANARY_CHANNEL = '-1004307422597' as const;

/** Alias de token staging ya provisionado en el entorno Aventa. */
export const CAZA_STAGING_TELEGRAM_TOKEN_ALIAS_ENV = 'TELEGRAM_BOT_TOKEN_STAGING' as const;
