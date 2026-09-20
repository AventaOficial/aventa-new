/**
 * CazaOfertasss — FASE 3.3. Telegram metrics capability map.
 *
 * Solo lo respaldado por evidencia (Bot API documentada + estado outbox).
 * No asume views/forwards/reactions que sendMessage no devuelve.
 */

export type TelegramMetricKind = 'observable' | 'derivable' | 'unknown';

export interface TelegramMetricCapability {
  readonly name: string;
  readonly kind: TelegramMetricKind;
  readonly evidence: string;
}

/**
 * Capabilidades reales respecto al path actual (Bot API sendMessage + outbox).
 */
export const TELEGRAM_METRIC_CAPABILITIES: readonly TelegramMetricCapability[] = [
  {
    name: 'send_attempted',
    kind: 'observable',
    evidence: 'outbox claim → SENDING + attempt_count',
  },
  {
    name: 'send_succeeded',
    kind: 'observable',
    evidence: 'Bot API sendMessage ok + telegram_message_id persistido',
  },
  {
    name: 'send_failed',
    kind: 'observable',
    evidence: 'outbox status FAILED + last_error_code',
  },
  {
    name: 'send_retry_scheduled',
    kind: 'observable',
    evidence: 'status PREPARED + next_attempt_at tras 429/5xx',
  },
  {
    name: 'message_id',
    kind: 'observable',
    evidence: 'respuesta oficial sendMessage.result.message_id',
  },
  {
    name: 'chat_id',
    kind: 'observable',
    evidence: 'canal allowlisted / chat_id usado en envío',
  },
  {
    name: 'published_at',
    kind: 'observable',
    evidence: 'timestamp local al confirmar PUBLISHED',
  },
  {
    name: 'pipeline_counts_prepared_sending_failed',
    kind: 'derivable',
    evidence: 'agregación acotada sobre caza_publications.status',
  },
  {
    name: 'channel_views',
    kind: 'unknown',
    evidence: 'Bot API sendMessage no retorna views; sin getChatStatistics en path actual',
  },
  {
    name: 'channel_forwards',
    kind: 'unknown',
    evidence: 'no expuesto por sendMessage',
  },
  {
    name: 'channel_reactions',
    kind: 'unknown',
    evidence: 'no expuesto por sendMessage',
  },
  {
    name: 'click_through_from_telegram',
    kind: 'unknown',
    evidence: 'requiere tracking afiliado/provider report; no es métrica Telegram nativa',
  },
] as const;

export interface TelegramPublicationObservables {
  readonly publicationId: string;
  readonly telegramMessageId: string | null;
  readonly telegramChatId: string | null;
  readonly publishedAt: string | null;
  readonly status: string;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
  /** Views: siempre null hasta evidencia oficial distinta de sendMessage. */
  readonly views: null;
  readonly forwards: null;
  readonly reactions: null;
}

export function toTelegramPublicationObservables(input: {
  readonly publicationId: string;
  readonly telegramMessageId: string | null;
  readonly telegramChatId: string | null;
  readonly publishedAt: string | null;
  readonly status: string;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
}): TelegramPublicationObservables {
  return {
    publicationId: input.publicationId,
    telegramMessageId: input.telegramMessageId,
    telegramChatId: input.telegramChatId,
    publishedAt: input.publishedAt,
    status: input.status,
    attemptCount: input.attemptCount,
    lastErrorCode: input.lastErrorCode,
    views: null,
    forwards: null,
    reactions: null,
  };
}
