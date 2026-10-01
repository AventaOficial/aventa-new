import { NextResponse } from 'next/server';
import { requireBearerMeUser, meAuthFailureResponse } from '@/lib/server/requireMeUser';
import { getRewardsMembership } from '@/lib/rewards/eligibility';
import { maybeUnlockRewardsProgram } from '@/lib/rewards/unlock';
import { enforceRateLimitCustom } from '@/lib/server/rateLimit';
import {
  classifyFinancialRecord,
} from '@/lib/finance/financialRecordClass';
import { createServerClient } from '@/lib/supabase/server';
import {
  EMPTY_PAYOUT_CERTIFICATION,
  presentCreatorReward,
  type PayoutCertification,
} from '@/lib/rewards/payoutReadModel';

type OfferSnippet = {
  id: string;
  title: string;
  image_url: string | null;
  store: string | null;
  price: number | null;
};

async function loadPayoutCertifications(rewardIds: string[]): Promise<Map<string, PayoutCertification>> {
  const certifications = new Map<string, PayoutCertification>();
  for (const rewardId of rewardIds) {
    certifications.set(rewardId, { ...EMPTY_PAYOUT_CERTIFICATION });
  }
  if (rewardIds.length === 0) return certifications;

  let admin;
  try {
    admin = createServerClient();
  } catch {
    return certifications;
  }

  const { data: intents, error: intentError } = await admin
    .from('payout_intents')
    .select('id, reward_id, status')
    .in('reward_id', rewardIds);
  if (intentError || !intents) return certifications;

  const succeededIntentByReward = new Map<string, string>();
  for (const row of intents as { id?: string; reward_id?: string; status?: string }[]) {
    if (row.status === 'SUCCEEDED' && row.id && row.reward_id) {
      succeededIntentByReward.set(row.reward_id, row.id);
    }
  }

  const { data: rewardAudits, error: rewardAuditError } = await admin
    .from('reward_audit_log')
    .select('entity_id')
    .eq('entity_type', 'creator_reward')
    .eq('event_type', 'reward_paid')
    .in('entity_id', rewardIds);
  if (rewardAuditError) return certifications;
  const rewardPaid = new Set(
    (rewardAudits ?? []).map((row: { entity_id?: string }) => row.entity_id).filter(Boolean),
  );

  const succeededIntentIds = [...succeededIntentByReward.values()];
  const intentCertified = new Set<string>();
  if (succeededIntentIds.length > 0) {
    const { data: intentAudits, error: intentAuditError } = await admin
      .from('reward_audit_log')
      .select('entity_id')
      .eq('entity_type', 'payout_intent')
      .eq('event_type', 'payout_intent_succeeded')
      .in('entity_id', succeededIntentIds);
    if (intentAuditError) return certifications;
    for (const row of intentAudits ?? []) {
      const entityId = (row as { entity_id?: string }).entity_id;
      if (entityId) intentCertified.add(entityId);
    }
  }

  for (const rewardId of rewardIds) {
    const intentId = succeededIntentByReward.get(rewardId);
    certifications.set(rewardId, {
      intentSucceeded: Boolean(intentId),
      rewardPaidAudit: rewardPaid.has(rewardId),
      payoutIntentSucceededAudit: Boolean(intentId && intentCertified.has(intentId)),
    });
  }
  return certifications;
}

/**
 * GET: historial de reconocimientos del cazador autenticado.
 * Incluye claim de bienvenida (profiles) + creator_rewards (ledger).
 * Solo el usuario de la sesión — nunca userId del cliente.
 */
function readStoredCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export async function GET(request: Request) {
  const auth = await requireBearerMeUser(request);
  if ('error' in auth) return meAuthFailureResponse(auth);
  const { user, supabase } = auth;

  const rl = await enforceRateLimitCustom(`rewards-history:${user.id}`, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 });
  }

  await maybeUnlockRewardsProgram(supabase, user.id, user.id);
  const membership = await getRewardsMembership(supabase, user.id);

  let welcomeOffer: OfferSnippet | null = null;
  if (membership.welcomeOfferId) {
    const { data: wo } = await supabase
      .from('offers')
      .select('id, title, image_url, store, price')
      .eq('id', membership.welcomeOfferId)
      .eq('created_by', user.id)
      .maybeSingle();
    if (wo) {
      const row = wo as {
        id: string;
        title: string;
        image_url?: string | null;
        store?: string | null;
        price?: number | null;
      };
      welcomeOffer = {
        id: row.id,
        title: row.title,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        price: row.price ?? null,
      };
    }
  }

  const { data: rewardRows, error } = await supabase
    .from('creator_rewards')
    .select(
      'id, offer_id, network, status, currency, creator_share_cents, hold_until, available_at, paid_at, created_at, meta, ledger_entry_id',
    )
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error && !(error.message ?? '').includes('creator_rewards')) {
    return NextResponse.json({ error: 'No se pudieron cargar recompensas' }, { status: 500 });
  }

  const rows = rewardRows ?? [];
  const ledgerIds = [
    ...new Set(
      rows
        .map((r: { ledger_entry_id?: string | null }) => r.ledger_entry_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const ledgerById: Record<string, { external_ref?: string | null; source?: string | null; notes?: string | null; meta?: unknown; tracking_tag?: string | null }> = {};
  if (ledgerIds.length > 0) {
    const { data: ledgers } = await supabase
      .from('affiliate_ledger_entries')
      .select('id, external_ref, source, notes, meta, tracking_tag')
      .in('id', ledgerIds);
    for (const L of ledgers ?? []) {
      const row = L as {
        id: string;
        external_ref?: string | null;
        source?: string | null;
        notes?: string | null;
        meta?: unknown;
        tracking_tag?: string | null;
      };
      ledgerById[row.id] = row;
    }
  }

  const offerIds = [
    ...new Set(
      rows
        .map((r: { offer_id?: string | null }) => r.offer_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const offersById: Record<string, OfferSnippet> = {};
  if (offerIds.length > 0) {
    const { data: offers } = await supabase
      .from('offers')
      .select('id, title, image_url, store, price')
      .in('id', offerIds)
      .eq('created_by', user.id);
    for (const o of offers ?? []) {
      const row = o as {
        id: string;
        title: string;
        image_url?: string | null;
        store?: string | null;
        price?: number | null;
      };
      offersById[row.id] = {
        id: row.id,
        title: row.title,
        image_url: row.image_url ?? null,
        store: row.store ?? null,
        price: row.price ?? null,
      };
    }
  }

  const paidIds = rows
    .filter((r: { status?: string; id: string }) => r.status === 'PAID')
    .map((r: { id: string }) => r.id);
  const certifications = await loadPayoutCertifications(paidIds);

  const rewards = rows.map(
    (r: {
      id: string;
      offer_id?: string | null;
      network?: string;
      status: string;
      hold_until?: string | null;
      available_at?: string | null;
      paid_at?: string | null;
      created_at: string;
      currency?: string | null;
      creator_share_cents?: number | null;
      meta?: unknown;
      ledger_entry_id?: string | null;
    }) => {
      const ledger = r.ledger_entry_id ? ledgerById[r.ledger_entry_id] : null;
      const recordClass = classifyFinancialRecord({
        meta: r.meta ?? ledger?.meta,
        externalRef: ledger?.external_ref,
        source: ledger?.source,
        notes: ledger?.notes,
        trackingTag: ledger?.tracking_tag,
      });
      const synthetic = recordClass === 'SYNTHETIC_QA';
      const certification = synthetic ? EMPTY_PAYOUT_CERTIFICATION : (certifications.get(r.id) ?? EMPTY_PAYOUT_CERTIFICATION);
      const mapped = presentCreatorReward({
        status: r.status,
        synthetic,
        certification,
      });
      return {
        id: r.id,
        kind: 'commission' as const,
        status: r.status,
        uiStatus: mapped.uiStatus,
        statusLabel: mapped.label,
        recordClass,
        isSynthetic: synthetic,
        network: r.network ?? null,
        createdAt: r.created_at,
        paidAt: r.paid_at ?? null,
        shareCents: readStoredCents(r.creator_share_cents),
        currency: typeof r.currency === 'string' && r.currency.trim() ? r.currency.trim().toUpperCase() : null,
        offer: r.offer_id ? offersById[r.offer_id] ?? null : null,
      };
    },
  );

  const productionRewards = rewards.filter((r) => !r.isSynthetic);
  const hasProductionPaid = productionRewards.some((r) => r.uiStatus === 'delivered');

  return NextResponse.json({
    welcome: {
      claimPhase: membership.claimPhase,
      displayNumber: 1,
      unlockedAt: membership.rewardProgramUnlockedAt,
      termsAcceptedAt: membership.rewardsTermsAcceptedAt,
      selectedAt: membership.welcomeOfferSelectedAt,
      offer: welcomeOffer,
      needsSelection: membership.needsWelcomeSelection,
    },
    moneyTruth: {
      hasProductionPaid,
      productionRewardCount: productionRewards.length,
      syntheticRewardCount: rewards.length - productionRewards.length,
      emptyProductionMessage:
        productionRewards.length === 0 ? 'Sin pagos reales' : null,
    },
    rewards,
  });
}
