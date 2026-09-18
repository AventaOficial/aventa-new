import type {
  DistributionProviderAdapter,
  DistributionPublishInput,
  DistributionPublishResult,
} from '../types';
import { redactTelegramSecrets, resolveTelegramBotToken } from './credentials';

export type TelegramFetch = typeof fetch;

function classifyTelegramHttpError(status: number, description: string): {
  retryable: boolean;
  code: string;
} {
  const d = description.toLowerCase();
  if (status === 429) return { retryable: true, code: 'telegram_rate_limited' };
  if (status >= 500) return { retryable: true, code: 'telegram_server_error' };
  if (status === 401 || status === 403) return { retryable: false, code: 'telegram_auth_forbidden' };
  if (d.includes('chat not found') || d.includes('blocked by the user')) {
    return { retryable: false, code: 'telegram_chat_unreachable' };
  }
  if (status === 400) return { retryable: false, code: 'telegram_bad_request' };
  return { retryable: status >= 500, code: `telegram_http_${status}` };
}

/**
 * Official Telegram Bot API adapter.
 * Inject `fetchImpl` in tests — never sends real traffic from unit tests.
 */
export function createTelegramAdapter(options?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: TelegramFetch;
  apiBase?: string;
}): DistributionProviderAdapter {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const apiBase = (options?.apiBase ?? 'https://api.telegram.org').replace(/\/$/, '');

  return {
    provider: 'telegram',

    async health(credentialRef) {
      const cred = resolveTelegramBotToken(credentialRef, env);
      if (!cred.ok) {
        return { ok: false, detail: cred.code };
      }
      try {
        const res = await fetchImpl(`${apiBase}/bot${cred.token}/getMe`, {
          method: 'GET',
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return { ok: false, detail: `http_${res.status}` };
        const body = (await res.json()) as { ok?: boolean };
        return { ok: Boolean(body.ok), detail: body.ok ? 'ok' : 'api_not_ok' };
      } catch (e) {
        return {
          ok: false,
          detail: redactTelegramSecrets(e instanceof Error ? e.message : 'health_failed'),
        };
      }
    },

    async publish(input: DistributionPublishInput): Promise<DistributionPublishResult> {
      const cred = resolveTelegramBotToken(input.credentialRef, env);
      if (!cred.ok) {
        return {
          ok: false,
          retryable: false,
          code: cred.code,
          message: cred.message,
          blockedExternalCredential: cred.code === 'BLOCKED_EXTERNAL_CREDENTIAL',
        };
      }

      const chatId = (input.externalDestinationKey ?? '').trim();
      if (!chatId || chatId === 'STAGING_UNSET' || chatId.startsWith('__')) {
        return {
          ok: false,
          retryable: false,
          code: 'BLOCKED_EXTERNAL_CREDENTIAL',
          message: 'staging chat_id not provisioned',
          blockedExternalCredential: true,
        };
      }

      const parseMode = input.parseMode ?? 'HTML';
      const usePhoto = Boolean(input.imageUrl);

      const endpoint = usePhoto
        ? `${apiBase}/bot${cred.token}/sendPhoto`
        : `${apiBase}/bot${cred.token}/sendMessage`;

      const body = usePhoto
        ? {
            chat_id: chatId,
            photo: input.imageUrl,
            caption: input.text.slice(0, 1024),
            parse_mode: parseMode,
            disable_web_page_preview: false,
          }
        : {
            chat_id: chatId,
            text: input.text.slice(0, 4096),
            parse_mode: parseMode,
            disable_web_page_preview: false,
          };

      try {
        const res = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });

        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          description?: string;
          result?: { message_id?: number };
          parameters?: { retry_after?: number };
        };

        if (!res.ok || !json.ok) {
          const description = redactTelegramSecrets(json.description ?? `http_${res.status}`);
          const classified = classifyTelegramHttpError(res.status, description);
          return {
            ok: false,
            retryable: classified.retryable || Boolean(json.parameters?.retry_after),
            code: classified.code,
            message: description,
          };
        }

        const messageId = json.result?.message_id;
        if (messageId === undefined || messageId === null) {
          return {
            ok: false,
            retryable: true,
            code: 'telegram_missing_message_id',
            message: 'Telegram ok but message_id missing — treat as retryable cautiously',
          };
        }

        return {
          ok: true,
          externalMessageId: String(messageId),
          provider: 'telegram',
          meta: { chat_id: chatId },
        };
      } catch (e) {
        const message = redactTelegramSecrets(e instanceof Error ? e.message : 'network_error');
        return {
          ok: false,
          retryable: true,
          code: 'telegram_network_error',
          message,
        };
      }
    },
  };
}
