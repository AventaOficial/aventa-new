/**
 * M4.4 — Admin payout confirmation / reconciliation HTTP boundary.
 * POST /api/admin/rewards/payouts/confirm
 *
 * Auth: requireUsersLogs (owner|admin) — same as manual payouts.
 * Actor: session only. Economy: applyProviderConfirmation only.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { isValidUuid } from '@/lib/server/validateUuid';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { isMoneyPathFrozen, moneyPathFrozenHttpBody } from '@/lib/server/moneyPathFreeze';
import { adminConfirmPayoutIntent } from '@/lib/rewards/payoutIntent/adminConfirm';

const MAX_BODY_BYTES = 16_384;

function parseOutcome(raw: unknown): 'confirmed_success' | 'confirmed_failure' | null {
  if (raw === 'confirmed_success' || raw === 'success' || raw === 'SUCCESS') {
    return 'confirmed_success';
  }
  if (raw === 'confirmed_failure' || raw === 'failure' || raw === 'FAILURE') {
    return 'confirmed_failure';
  }
  return null;
}

export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }

  const ip = getClientIp(request);
  const rl = await enforceRateLimit(`admin-payout-confirm:${auth.user.id}:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  // Never trust client actor / role.
  if ('actor_id' in body || 'actorId' in body || 'role' in body || 'user_role' in body) {
    return NextResponse.json(
      { error: 'actor/role no permitidos en body', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const operationRaw =
    typeof (body as { operation?: unknown }).operation === 'string'
      ? (body as { operation: string }).operation.trim().toLowerCase()
      : '';
  if (operationRaw !== 'confirm' && operationRaw !== 'reconcile') {
    return NextResponse.json(
      { error: 'operation debe ser confirm|reconcile', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const payoutIntentId =
    typeof (body as { payout_intent_id?: unknown }).payout_intent_id === 'string'
      ? (body as { payout_intent_id: string }).payout_intent_id.trim()
      : typeof (body as { payoutIntentId?: unknown }).payoutIntentId === 'string'
        ? (body as { payoutIntentId: string }).payoutIntentId.trim()
        : '';
  if (!payoutIntentId || !isValidUuid(payoutIntentId)) {
    return NextResponse.json(
      { error: 'payout_intent_id inválido', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const provider =
    typeof (body as { provider?: unknown }).provider === 'string'
      ? (body as { provider: string }).provider.trim()
      : '';
  if (!provider || provider.length > 64) {
    return NextResponse.json(
      { error: 'provider inválido', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const providerReference =
    typeof (body as { provider_reference?: unknown }).provider_reference === 'string'
      ? (body as { provider_reference: string }).provider_reference.trim()
      : typeof (body as { providerReference?: unknown }).providerReference === 'string'
        ? (body as { providerReference: string }).providerReference.trim()
        : '';
  if (!providerReference || providerReference.length < 4 || providerReference.length > 256) {
    return NextResponse.json(
      { error: 'provider_reference inválido', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const idempotencyKey =
    typeof (body as { idempotency_key?: unknown }).idempotency_key === 'string'
      ? (body as { idempotency_key: string }).idempotency_key.trim()
      : typeof (body as { idempotencyKey?: unknown }).idempotencyKey === 'string'
        ? (body as { idempotencyKey: string }).idempotencyKey.trim()
        : '';
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: 'idempotency_key inválida', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const amountCents = Number(
    (body as { amount_cents?: unknown }).amount_cents ??
      (body as { amountCents?: unknown }).amountCents,
  );
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
    return NextResponse.json(
      { error: 'amount_cents inválido', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const currencyRaw =
    typeof (body as { currency?: unknown }).currency === 'string'
      ? (body as { currency: string }).currency.trim().toUpperCase()
      : '';
  if (!currencyRaw || currencyRaw.length !== 3) {
    return NextResponse.json(
      { error: 'currency inválida', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const outcome = parseOutcome(
    (body as { outcome?: unknown }).outcome ?? (body as { status?: unknown }).status,
  );
  if (!outcome) {
    return NextResponse.json(
      {
        error: 'outcome debe ser confirmed_success|confirmed_failure',
        code: 'INVALID_EVIDENCE',
      },
      { status: 400 },
    );
  }

  // Reject client-supplied direct mutation knobs.
  if ('reward_status' in (body as object) || 'mark_paid' in (body as object)) {
    return NextResponse.json(
      { error: 'campos de mutación directa no permitidos', code: 'INVALID_EVIDENCE' },
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const result = await adminConfirmPayoutIntent(supabase, {
    operation: operationRaw,
    payoutIntentId,
    provider,
    providerReference,
    idempotencyKey,
    amountCents,
    currency: currencyRaw,
    outcome,
    actorId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, reason: result.reason ?? null },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    code: result.code,
    operation: operationRaw,
    payoutIntentId: result.intent.id,
    intentStatus: result.intent.status,
    rewardId: result.rewardId,
    rewardStatus: result.rewardStatus,
    providerReference: result.intent.meta?.provider_reference ?? providerReference,
  });
}

/** Only POST is allowed. */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
