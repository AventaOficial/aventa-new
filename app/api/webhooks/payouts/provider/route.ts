/**
 * M4.6 — Provider webhook HTTP ingress (server-only).
 * POST /api/webhooks/payouts/provider
 *
 * Signature → normalize → applyProviderConfirmation.
 * Never mutates creator_rewards directly.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isMoneyPathFrozen, moneyPathFrozenHttpBody } from '@/lib/server/moneyPathFreeze';
import { processProviderWebhook } from '@/lib/rewards/payoutIntent/providerWebhook';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 32_768;

export async function POST(request: Request) {
  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 });
  }

  const result = await processProviderWebhook(supabase, {
    rawBody,
    headers: request.headers,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: result.code,
        reason: result.reason,
        error: result.message ?? result.reason,
      },
      { status: result.status },
    );
  }

  // Never echo secrets or raw provider credentials.
  return NextResponse.json({
    ok: true,
    code: result.code,
    payoutIntentId: result.intentResult.intent.id,
    intentStatus: result.intentResult.intent.status,
    rewardId: result.intentResult.intent.reward_id,
  });
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
