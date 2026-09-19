/**
 * CazaOfertasss — Port del Bot API de Telegram.
 *
 * Ninguna lógica de Telegram vive en el dominio. Este port es la única
 * superficie que el outbox conoce. El adapter HTTP es una implementación.
 *
 * Sólo se modelan capacidades oficiales documentadas: sendMessage.
 */

export type CazaTelegramParseMode = 'HTML' | 'MarkdownV2';

export interface CazaTelegramSendMessageInput {
  readonly chatId: string;
  readonly text: string;
  readonly parseMode?: CazaTelegramParseMode;
  readonly disableWebPagePreview?: boolean;
  /**
   * Identidad de publicación. Se usa sólo para logging/observabilidad del
   * adapter; Telegram Bot API no ofrece idempotency key en sendMessage.
   */
  readonly publicationId: string;
}

export type CazaTelegramSendResult =
  | {
      readonly ok: true;
      readonly messageId: string;
      readonly chatId: string;
    }
  | {
      readonly ok: false;
      readonly retryable: boolean;
      /** Timeout/network ambiguo: Telegram pudo haber aceptado el mensaje. */
      readonly unknownOutcome: boolean;
      readonly code: string;
      readonly message: string;
      readonly retryAfterSeconds: number | null;
      readonly httpStatus: number | null;
    };

export interface CazaTelegramBotPort {
  sendMessage(input: CazaTelegramSendMessageInput): Promise<CazaTelegramSendResult>;
}

export type CazaTelegramFetch = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;
