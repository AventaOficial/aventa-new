/**
 * M4.6 — Provider webhook boundary.
 * Verify signature → normalize evidence → applyProviderConfirmation.
 * Never writes creator_rewards / PAID directly.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyProviderConfirmation,
  loadPayoutIntent,
  loadPayoutIntentByReward,
  type PayoutIntentOpResult,
} from './engine';
import { PAYOUT_INTENT_PROVIDER_REAL } from './realProviderConfig';
import { loadRealProviderConfig } from './realProviderConfig';

export const PROVIDER_WEBHOOK_SIGNATURE_HEADER = 'x-aventa-payout-signature';

export type ProviderWebhookVerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_secret' | 'missing_signature' | 'invalid_signature';
      message: string;
    };

export type ProviderWebhookProcessResult =
  | {
      ok: true;
      code: 'SUCCESS' | 'ALREADY_APPLIED' | 'STILL_UNKNOWN';
      intentResult: PayoutIntentOpResult & { ok: true };
    }
  | {
      ok: false;
      code:
        | 'UNAUTHORIZED'
        | 'INVALID_PAYLOAD'
        | 'INVALID_EVIDENCE'
        | 'NOT_FOUND'
        | 'MONEY_PATH_FROZEN'
        | 'FAILED';
      status: number;
      reason: string;
      message?: string;
    };

/** HMAC-SHA256 hex over raw body. */
export function signProviderWebhookPayload(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyProviderWebhookSignature(
  rawBody: string,
  headers: Headers | Record<string, string | string[] | undefined>,
  secret: string | null | undefined,
): ProviderWebhookVerifyResult {
  if (!secret?.trim()) {
    return {
      ok: false,
      reason: 'missing_secret',
      message: 'PAYOUT_PROVIDER_WEBHOOK_SECRET not configured',
    };
  }

  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
    }
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };

  const provided =
    get(PROVIDER_WEBHOOK_SIGNATURE_HEADER) ??
    get('X-Aventa-Payout-Signature') ??
    get('x-signature');
  if (!provided?.trim()) {
    return {
      ok: false,
      reason: 'missing_signature',
      message: 'webhook signature header required',
    };
  }

  const expected = signProviderWebhookPayload(rawBody, secret.trim());
  try {
    const a = Buffer.from(provided.trim(), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'invalid_signature', message: 'signature mismatch' };
    }
  } catch {
    return { ok: false, reason: 'invalid_signature', message: 'signature compare failed' };
  }
  return { ok: true };
}

type ParsedWebhook = {
  intentId: string | null;
  rewardId: string | null;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  providerReference: string;
  provider: string;
  outcome: 'confirmed_success' | 'confirmed_failure' | 'unknown';
};

function parseWebhookPayload(payload: unknown): ParsedWebhook | { error: string } {
  if (!payload || typeof payload !== 'object') {
    return { error: 'payload_not_object' };
  }
  const p = payload as Record<string, unknown>;
  const intentId =
    typeof p.intent_id === 'string'
      ? p.intent_id.trim()
      : typeof p.intentId === 'string'
        ? p.intentId.trim()
        : typeof p.payout_intent_id === 'string'
          ? p.payout_intent_id.trim()
          : null;
  const rewardId =
    typeof p.reward_id === 'string'
      ? p.reward_id.trim()
      : typeof p.rewardId === 'string'
        ? p.rewardId.trim()
        : null;
  const amountCents = Number(p.amount_cents ?? p.amountCents);
  const currency =
    typeof p.currency === 'string' ? p.currency.trim().toUpperCase() : '';
  const idempotencyKey =
    typeof p.idempotency_key === 'string'
      ? p.idempotency_key.trim()
      : typeof p.idempotencyKey === 'string'
        ? p.idempotencyKey.trim()
        : '';
  const providerReference =
    typeof p.provider_reference === 'string'
      ? p.provider_reference.trim()
      : typeof p.providerReference === 'string'
        ? p.providerReference.trim()
        : typeof p.transaction_id === 'string'
          ? p.transaction_id.trim()
          : typeof p.transfer_reference === 'string'
            ? p.transfer_reference.trim()
            : '';
  const provider =
    typeof p.provider === 'string' && p.provider.trim()
      ? p.provider.trim()
      : PAYOUT_INTENT_PROVIDER_REAL;

  const statusRaw = String(p.status ?? p.outcome ?? p.state ?? '')
    .trim()
    .toLowerCase();
  let outcome: ParsedWebhook['outcome'] = 'unknown';
  if (
    statusRaw === 'success' ||
    statusRaw === 'succeeded' ||
    statusRaw === 'paid' ||
    statusRaw === 'completed' ||
    statusRaw === 'confirmed_success'
  ) {
    outcome = 'confirmed_success';
  } else if (
    statusRaw === 'failure' ||
    statusRaw === 'failed' ||
    statusRaw === 'rejected' ||
    statusRaw === 'confirmed_failure'
  ) {
    outcome = 'confirmed_failure';
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
    return { error: 'amount_invalid' };
  }
  if (!currency || currency.length !== 3) return { error: 'currency_invalid' };
  if (!idempotencyKey) return { error: 'idempotency_key_missing' };
  if (!providerReference) return { error: 'provider_reference_missing' };

  return {
    intentId,
    rewardId,
    amountCents,
    currency,
    idempotencyKey,
    providerReference,
    provider,
    outcome,
  };
}

/**
 * Process authenticated provider webhook → applyProviderConfirmation only.
 * Duplicate → ALREADY_APPLIED. Unknown status → STILL_UNKNOWN (no PAID).
 */
export async function processProviderWebhook(
  supabase: SupabaseClient,
  input: {
    rawBody: string;
    headers: Headers | Record<string, string | string[] | undefined>;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProviderWebhookProcessResult> {
  const env = input.env ?? process.env;
  const cfg = loadRealProviderConfig(env);
  // Webhook requires webhook secret even if API key present.
  const secret = cfg.ok
    ? cfg.config.webhookSecret
    : (env.PAYOUT_PROVIDER_WEBHOOK_SECRET ?? '').trim() || null;

  const verified = verifyProviderWebhookSignature(input.rawBody, input.headers, secret);
  if (!verified.ok) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      status: 401,
      reason: verified.reason,
      message: verified.message,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      status: 400,
      reason: 'malformed_json',
    };
  }

  const parsed = parseWebhookPayload(payload);
  if ('error' in parsed) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      status: 400,
      reason: parsed.error,
    };
  }

  if (parsed.outcome === 'unknown') {
    return {
      ok: false,
      code: 'INVALID_EVIDENCE',
      status: 400,
      reason: 'unknown_provider_status',
      message: 'webhook unknown status must not transition to PAID',
    };
  }

  let intent = parsed.intentId
    ? await loadPayoutIntent(supabase, parsed.intentId)
    : null;
  if (!intent && parsed.rewardId) {
    intent = await loadPayoutIntentByReward(supabase, parsed.rewardId);
  }
  if (!intent) {
    // Resolve by idempotency key via reward scan is not needed — fail closed.
    return {
      ok: false,
      code: 'NOT_FOUND',
      status: 404,
      reason: 'intent_not_found',
    };
  }

  const result = await applyProviderConfirmation(supabase, {
    intentId: intent.id,
    rewardId: parsed.rewardId ?? intent.reward_id,
    amountCents: parsed.amountCents,
    currency: parsed.currency,
    idempotencyKey: parsed.idempotencyKey,
    provider: parsed.provider || intent.provider,
    providerReference: parsed.providerReference,
    outcome: parsed.outcome,
    actorId: null,
  });

  if (!result.ok) {
    if (result.reason === 'money_path_frozen') {
      return {
        ok: false,
        code: 'MONEY_PATH_FROZEN',
        status: 503,
        reason: result.reason,
      };
    }
    if (
      result.reason === 'amount_mismatch' ||
      result.reason === 'currency_mismatch' ||
      result.reason === 'provider_reference_mismatch' ||
      result.reason === 'idempotency_key_mismatch' ||
      result.reason === 'reward_mismatch' ||
      result.reason === 'provider_mismatch' ||
      result.reason === 'evidence_missing'
    ) {
      return {
        ok: false,
        code: 'INVALID_EVIDENCE',
        status: 400,
        reason: result.reason,
        message: result.message,
      };
    }
    if (result.reason === 'intent_not_found') {
      return { ok: false, code: 'NOT_FOUND', status: 404, reason: result.reason };
    }
    return {
      ok: false,
      code: 'FAILED',
      status: 400,
      reason: result.reason,
      message: result.message,
    };
  }

  return {
    ok: true,
    code: result.reused ? 'ALREADY_APPLIED' : 'SUCCESS',
    intentResult: result,
  };
}
