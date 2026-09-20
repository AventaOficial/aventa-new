/**
 * M1 Settlement ops — diagnostic surface (GET) + gated settle (POST).
 * Settlement remains OFF unless SETTLEMENT_BRIDGE_ENABLED=true and money path unfrozen.
 * Never creates rewards/payouts inside settleCommission.
 * M5.1: after successful settle, schedules durable ledger→reward attempt (async; no sync create).
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  buildSettlementDiagnostics,
  settleCommission,
  isSettlementBridgeEnabled,
} from '@/lib/economy/settlement';
import { scheduleLedgerRewardAttempt } from '@/lib/rewards/ledgerRewardBridge';

export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const commissionId = url.searchParams.get('commissionId')?.trim() ?? '';
  if (!commissionId) {
    return NextResponse.json(
      {
        settlementBridgeEnabled: isSettlementBridgeEnabled(),
        error: 'commissionId_required',
      },
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const diag = await buildSettlementDiagnostics(supabase, commissionId);
  if (!diag) {
    return NextResponse.json(
      {
        settlementBridgeEnabled: isSettlementBridgeEnabled(),
        error: 'commission_not_found',
        commissionId,
      },
      { status: 404 },
    );
  }
  return NextResponse.json(diag);
}

export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const commissionId =
    typeof body?.commissionId === 'string' ? body.commissionId.trim() : '';
  if (!commissionId) {
    return NextResponse.json({ error: 'commissionId_required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await settleCommission(supabase, {
    commissionId,
    actor: 'admin_settlement_ops',
  });

  let rewardBridgeSchedule: Awaited<ReturnType<typeof scheduleLedgerRewardAttempt>> | null =
    null;
  if (result.ok && result.ledgerEntryId) {
    // Orchestration only — does not call createRewardFromLedgerEntry.
    rewardBridgeSchedule = await scheduleLedgerRewardAttempt(supabase, {
      ledgerEntryId: result.ledgerEntryId,
      commissionId,
    });
  }

  return NextResponse.json(
    { ...result, rewardBridgeSchedule },
    {
      status: result.ok ? 200 : result.reason === 'commission_not_found' ? 404 : 409,
    },
  );
}
