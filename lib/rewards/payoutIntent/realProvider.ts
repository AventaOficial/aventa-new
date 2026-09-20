/**
 * M4.6 — Real payout provider adapter (HTTP boundary).
 * Implements existing PayoutProvider. Never mutates DB / rewards / ledger.
 * Network uncertainty → timeout (engine maps to UNKNOWN). Never invent SUCCESS.
 */

import type {
  PayoutIntentRow,
  PayoutProvider,
  PayoutProviderReconcileResult,
  PayoutProviderSubmitResult,
} from './types';
import {
  PAYOUT_INTENT_PROVIDER_REAL,
  type RealProviderConfig,
} from './realProviderConfig';

export type RealProviderHttpResponse = {
  ok: boolean;
  status: number;
  /** Parsed JSON body when available; never includes credentials. */
  body: unknown;
  /** True when aborted / network error / undecodable — treat as UNKNOWN. */
  uncertain?: boolean;
};

export type RealProviderSubmitRequest = {
  path: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Record<string, unknown>;
  timeoutMs: number;
};

export type RealProviderReconcileRequest = {
  path: string;
  method: 'GET';
  headers: Record<string, string>;
  query: Record<string, string>;
  timeoutMs: number;
};

/**
 * Injectable transport — tests inject deterministic emulator.
 * Production/staging default uses fetch against PAYOUT_PROVIDER_API_URL.
 */
export type RealProviderTransport = {
  submit(req: RealProviderSubmitRequest): Promise<RealProviderHttpResponse>;
  reconcile(req: RealProviderReconcileRequest): Promise<RealProviderHttpResponse>;
};

export type RealPayoutProvider = PayoutProvider & {
  kind: 'real';
  config: Omit<RealProviderConfig, 'apiKey' | 'webhookSecret'> & {
    /** Presence flag only — never the secret value. */
    hasApiKey: true;
    hasWebhookSecret: boolean;
  };
};

function authHeaders(config: RealProviderConfig, idempotencyKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Idempotency-Key': idempotencyKey,
    'X-Aventa-Idempotency-Key': idempotencyKey,
  };
}

function readStatus(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const o = body as Record<string, unknown>;
  const raw =
    (typeof o.status === 'string' && o.status) ||
    (typeof o.outcome === 'string' && o.outcome) ||
    (typeof o.state === 'string' && o.state) ||
    '';
  return raw.trim().toLowerCase();
}

function readProviderReference(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  for (const key of [
    'provider_reference',
    'providerReference',
    'transaction_id',
    'transfer_reference',
    'external_ref',
    'id',
  ]) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function mapSubmitBody(body: unknown, uncertain: boolean): PayoutProviderSubmitResult {
  if (uncertain) {
    return { outcome: 'timeout', reason: 'provider_network_uncertainty' };
  }
  const status = readStatus(body);
  const ref = readProviderReference(body);
  if (
    status === 'success' ||
    status === 'succeeded' ||
    status === 'paid' ||
    status === 'completed' ||
    status === 'confirmed_success'
  ) {
    return { outcome: 'success', externalRef: ref };
  }
  if (
    status === 'initiated' ||
    status === 'submitted' ||
    status === 'pending' ||
    status === 'processing' ||
    status === 'accepted'
  ) {
    return { outcome: 'initiated', externalRef: ref };
  }
  if (
    status === 'failure' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'confirmed_failure'
  ) {
    return { outcome: 'failure', reason: 'provider_reported_failure' };
  }
  // Malformed / unknown status → never SUCCESS
  return { outcome: 'timeout', reason: 'provider_malformed_or_unknown_status' };
}

function mapReconcileBody(body: unknown, uncertain: boolean): PayoutProviderReconcileResult {
  if (uncertain) {
    return { outcome: 'unknown', reason: 'provider_network_uncertainty' };
  }
  const status = readStatus(body);
  const ref = readProviderReference(body);
  if (
    status === 'success' ||
    status === 'succeeded' ||
    status === 'paid' ||
    status === 'completed' ||
    status === 'confirmed_success'
  ) {
    return { outcome: 'success', externalRef: ref };
  }
  if (
    status === 'failure' ||
    status === 'failed' ||
    status === 'rejected' ||
    status === 'confirmed_failure'
  ) {
    return { outcome: 'failure', reason: 'provider_reported_failure' };
  }
  return { outcome: 'unknown', reason: 'provider_still_unknown' };
}

async function defaultFetch(
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<RealProviderHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, status: res.status, body: null, uncertain: true };
      }
    }
    // 5xx / 408 / 429 → uncertainty (UNKNOWN), not definitive failure
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      return { ok: false, status: res.status, body, uncertain: true };
    }
    return { ok: res.ok, status: res.status, body, uncertain: false };
  } catch {
    return { ok: false, status: 0, body: null, uncertain: true };
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpRealProviderTransport(
  config: RealProviderConfig,
): RealProviderTransport {
  return {
    async submit(req) {
      return defaultFetch(`${config.apiUrl}${req.path}`, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(req.body),
        timeoutMs: req.timeoutMs,
      });
    },
    async reconcile(req) {
      const qs = new URLSearchParams(req.query).toString();
      const url = `${config.apiUrl}${req.path}${qs ? `?${qs}` : ''}`;
      return defaultFetch(url, {
        method: req.method,
        headers: req.headers,
        timeoutMs: req.timeoutMs,
      });
    },
  };
}

/**
 * Create real provider adapter. Secrets stay on config object — never returned in evidence.
 * Pass transport for tests; default uses HTTPS fetch.
 */
export function createRealPayoutProvider(
  config: RealProviderConfig,
  transport?: RealProviderTransport,
): RealPayoutProvider {
  const tx = transport ?? createHttpRealProviderTransport(config);

  return {
    id: PAYOUT_INTENT_PROVIDER_REAL,
    kind: 'real',
    config: {
      apiUrl: config.apiUrl,
      timeoutMs: config.timeoutMs,
      hasApiKey: true,
      hasWebhookSecret: Boolean(config.webhookSecret),
    },
    async submit(intent: PayoutIntentRow): Promise<PayoutProviderSubmitResult> {
      // Always send the existing stable idempotency_key — never regenerate.
      const res = await tx.submit({
        path: '/v1/payouts',
        method: 'POST',
        headers: authHeaders(config, intent.idempotency_key),
        body: {
          amount_cents: intent.amount_cents,
          currency: intent.currency,
          idempotency_key: intent.idempotency_key,
          intent_id: intent.id,
          reward_id: intent.reward_id,
          creator_id: intent.creator_id,
        },
        timeoutMs: config.timeoutMs,
      });

      if (res.uncertain || res.status === 0) {
        return { outcome: 'timeout', reason: 'provider_network_uncertainty' };
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        // Definitive client error from provider (bad request / rejected)
        if (res.status === 402 || res.status === 403 || res.status === 422) {
          return { outcome: 'failure', reason: `provider_http_${res.status}` };
        }
        // Other 4xx without clear failure semantics → UNKNOWN
        return { outcome: 'timeout', reason: `provider_http_${res.status}` };
      }
      return mapSubmitBody(res.body, Boolean(res.uncertain));
    },
    async reconcile(intent: PayoutIntentRow): Promise<PayoutProviderReconcileResult> {
      const existingRef =
        typeof intent.meta?.provider_reference === 'string'
          ? intent.meta.provider_reference.trim()
          : '';
      // Reconcile by stable identity — never create a new payout.
      const res = await tx.reconcile({
        path: '/v1/payouts/status',
        method: 'GET',
        headers: authHeaders(config, intent.idempotency_key),
        query: {
          idempotency_key: intent.idempotency_key,
          ...(existingRef ? { provider_reference: existingRef } : {}),
          intent_id: intent.id,
        },
        timeoutMs: config.timeoutMs,
      });

      if (res.uncertain || res.status === 0) {
        return { outcome: 'unknown', reason: 'provider_network_uncertainty' };
      }
      if (res.status === 404) {
        return { outcome: 'unknown', reason: 'provider_not_found_yet' };
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        if (res.status === 402 || res.status === 403 || res.status === 422) {
          return { outcome: 'failure', reason: `provider_http_${res.status}` };
        }
        return { outcome: 'unknown', reason: `provider_http_${res.status}` };
      }
      return mapReconcileBody(res.body, Boolean(res.uncertain));
    },
  };
}
