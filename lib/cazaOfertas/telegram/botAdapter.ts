/**
 * CazaOfertasss — Adapter HTTP del Bot API oficial de Telegram.
 *
 * Documentado: https://core.telegram.org/bots/api#sendmessage
 * No inventa endpoints. No scrapea. Inject `fetchImpl` en tests.
 */

import { TELEGRAM_HTTP_TIMEOUT_MS } from '../constants';
import type {
  CazaTelegramBotPort,
  CazaTelegramFetch,
  CazaTelegramSendMessageInput,
  CazaTelegramSendResult,
} from './botPort';
import { redactTelegramSecrets, resolveCazaTelegramBotToken } from './credentials';

function classifyTelegramHttpError(
  status: number,
  description: string
): { retryable: boolean; code: string } {
  const d = description.toLowerCase();
  if (status === 429) return { retryable: true, code: 'telegram_rate_limited' };
  if (status >= 500) return { retryable: true, code: 'telegram_server_error' };
  if (status === 401 || status === 403) {
    return { retryable: false, code: 'telegram_auth_forbidden' };
  }
  if (d.includes('chat not found') || d.includes('blocked by the user')) {
    return { retryable: false, code: 'telegram_chat_unreachable' };
  }
  if (status === 400) return { retryable: false, code: 'telegram_bad_request' };
  return { retryable: status >= 500, code: `telegram_http_${status}` };
}

export interface CreateCazaTelegramBotAdapterOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: CazaTelegramFetch;
  readonly apiBase?: string;
  readonly credentialEnvVar?: string;
  readonly timeoutMs?: number;
}

export function createCazaTelegramBotAdapter(
  options: CreateCazaTelegramBotAdapterOptions = {}
): CazaTelegramBotPort {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = (options.apiBase ?? 'https://api.telegram.org').replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? TELEGRAM_HTTP_TIMEOUT_MS;
  const credentialEnvVar = options.credentialEnvVar;

  return {
    async sendMessage(input: CazaTelegramSendMessageInput): Promise<CazaTelegramSendResult> {
      const cred = resolveCazaTelegramBotToken(credentialEnvVar, env);
      if (!cred.ok) {
        return {
          ok: false,
          retryable: false,
          unknownOutcome: false,
          code: cred.reasons[0] ?? 'telegram.credential_missing',
          message: cred.reasons.join(','),
          retryAfterSeconds: null,
          httpStatus: null,
        };
      }

      const chatId = input.chatId.trim();
      if (!chatId || chatId.startsWith('__') || chatId === 'STAGING_UNSET') {
        return {
          ok: false,
          retryable: false,
          unknownOutcome: false,
          code: 'telegram_chat_not_provisioned',
          message: 'chat_id not provisioned',
          retryAfterSeconds: null,
          httpStatus: null,
        };
      }

      const text = input.text.slice(0, 4096);
      const endpoint = `${apiBase}/bot${cred.value.token}/sendMessage`;
      const body = {
        chat_id: chatId,
        text,
        parse_mode: input.parseMode ?? 'HTML',
        disable_web_page_preview: input.disableWebPagePreview ?? false,
      };

      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });

        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number; chat?: { id?: number } };
          parameters?: { retry_after?: number };
        };

        if (!res.ok || !json.ok) {
          const description = redactTelegramSecrets(
            json.description ?? `http_${res.status}`,
            cred.value.token
          );
          const classified = classifyTelegramHttpError(res.status, description);
          const retryAfter =
            typeof json.parameters?.retry_after === 'number' &&
            Number.isFinite(json.parameters.retry_after)
              ? Math.max(0, Math.floor(json.parameters.retry_after))
              : null;
          return {
            ok: false,
            retryable: classified.retryable || retryAfter !== null,
            unknownOutcome: false,
            code: classified.code,
            message: description,
            retryAfterSeconds: retryAfter,
            httpStatus: res.status,
          };
        }

        const messageId = json.result?.message_id;
        if (messageId === undefined || messageId === null) {
          return {
            ok: false,
            retryable: false,
            unknownOutcome: true,
            code: 'telegram_missing_message_id',
            message:
              'Telegram ok but message_id missing — UNKNOWN_OUTCOME (do not auto-retry)',
            retryAfterSeconds: null,
            httpStatus: res.status,
          };
        }

        const resultChatId =
          json.result?.chat?.id !== undefined && json.result.chat.id !== null
            ? String(json.result.chat.id)
            : chatId;

        return {
          ok: true,
          messageId: String(messageId),
          chatId: resultChatId,
        };
      } catch (e) {
        const message = redactTelegramSecrets(
          e instanceof Error ? e.message : 'network_error',
          cred.value.token
        );
        // Timeout / network after request may mean provider accepted — UNKNOWN.
        return {
          ok: false,
          retryable: false,
          unknownOutcome: true,
          code: 'telegram_network_or_timeout',
          message,
          retryAfterSeconds: null,
          httpStatus: null,
        };
      }
    },
  };
}
