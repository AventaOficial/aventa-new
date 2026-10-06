import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActorType } from '@/lib/actors/actorType';
import { latestBetaMembership } from '@/lib/rewards/betaCohortStore';
import {
  evaluateShadowEligibility,
  pinShadowRule,
  SHADOW_OBSERVATION_KIND,
  type ShadowChainEvidence,
  type ShadowObservation,
  type ShadowRule,
} from './shadowEligibility';

const MONEY_TABLES = new Set([
  'creator_rewards',
  'affiliate_ledger_entries',
  'ledger_settlements',
  'payout_intents',
  'reward_payouts',
]);

export type PersistShadowResult =
  | { ok: true; observation: ShadowObservation; reused: boolean }
  | { ok: false; reason: string };

type ProjectionRow = {
  commission_id: string;
  rule_version: string;
  creator_share_bps: number;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Observa una comisión y guarda una sola proyección shadow.
 * No escribe tablas de dinero. La regla de la primera fila no se reemplaza.
 */
export async function persistShadowProjection(
  supabase: SupabaseClient,
  input: { commissionId: string; rule: ShadowRule },
): Promise<PersistShadowResult> {
  const guarded = guardMoneyWrites(supabase);
  const commissionId = input.commissionId.trim();
  if (!commissionId) return { ok: false, reason: 'missing_commission' };
  if (!input.rule.version.trim()) return { ok: false, reason: 'missing_rule' };

  const { data: commissionRow, error: commissionError } = await guarded
    .from('affiliate_commissions')
    .select('id, conversion_id, status, gross_commission_cents')
    .eq('id', commissionId)
    .maybeSingle();
  if (commissionError || !commissionRow) return { ok: false, reason: 'missing_commission' };

  const conversionId = asString((commissionRow as { conversion_id?: string }).conversion_id);
  const { data: conversionRow } = conversionId
    ? await guarded
        .from('affiliate_conversions')
        .select('id, click_id, offer_id, attribution_status, attribution_meta')
        .eq('id', conversionId)
        .maybeSingle()
    : { data: null };

  const clickId = asString((conversionRow as { click_id?: string } | null)?.click_id);
  const { data: clickRow } = clickId
    ? await guarded
        .from('reward_outbound_clicks')
        .select('id, offer_id, clicker_user_id')
        .eq('id', clickId)
        .maybeSingle()
    : { data: null };

  const offerId =
    asString((clickRow as { offer_id?: string } | null)?.offer_id) ??
    asString((conversionRow as { offer_id?: string } | null)?.offer_id);
  const { data: offerRow } = offerId
    ? await guarded.from('offers').select('id, created_by').eq('id', offerId).maybeSingle()
    : { data: null };

  const creatorId = asString((offerRow as { created_by?: string } | null)?.created_by);
  const actorType = creatorId ? await resolveActorType(guarded, creatorId) : null;
  const membership = creatorId ? await latestBetaMembership(guarded, creatorId) : null;

  const { data: existing } = await guarded
    .from('economic_shadow_projections')
    .select('commission_id, rule_version, creator_share_bps')
    .eq('commission_id', commissionId)
    .maybeSingle();

  const pinned = pinShadowRule(
    existing
      ? {
          ruleVersion: String((existing as ProjectionRow).rule_version),
          creatorShareBps: Number((existing as ProjectionRow).creator_share_bps),
        }
      : null,
    input.rule,
  );

  const evidence: ShadowChainEvidence = {
    commission: {
      id: String((commissionRow as { id: string }).id),
      conversionId: conversionId ?? '',
      status: String((commissionRow as { status?: string }).status ?? ''),
      grossCommissionCents: Number((commissionRow as { gross_commission_cents?: number }).gross_commission_cents),
    },
    conversion: conversionRow
      ? {
          id: String((conversionRow as { id: string }).id),
          clickId: asString((conversionRow as { click_id?: string }).click_id),
          offerId: asString((conversionRow as { offer_id?: string }).offer_id),
          attributionStatus: attributionStatusOf(conversionRow),
        }
      : null,
    click: clickRow
      ? {
          id: String((clickRow as { id: string }).id),
          offerId: String((clickRow as { offer_id?: string }).offer_id ?? ''),
          clickerUserId: asString((clickRow as { clicker_user_id?: string }).clicker_user_id),
        }
      : null,
    offer: offerRow
      ? {
          id: String((offerRow as { id: string }).id),
          creatorUserId: creatorId,
        }
      : null,
    actorType,
    membershipStatus: membership?.status ?? 'none',
    attributionMethod: attributionMethodFromConversion(conversionRow as { attribution_meta?: unknown } | null),
  };

  const observation = evaluateShadowEligibility(evidence, pinned);
  observation.commissionId = commissionId;
  const row = toRow(observation);
  if (existing) {
    const { error } = await guarded
      .from('economic_shadow_projections')
      .update({
        conversion_id: row.conversion_id,
        click_id: row.click_id,
        offer_id: row.offer_id,
        creator_user_id: row.creator_user_id,
        gross_commission_cents: row.gross_commission_cents,
        projected_creator_cents: row.projected_creator_cents,
        projected_platform_cents: row.projected_platform_cents,
        eligibility_status: row.eligibility_status,
        reason: row.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('commission_id', commissionId);
    if (error) return { ok: false, reason: 'projection_write_failed' };
    return { ok: true, observation, reused: true };
  }

  const { error } = await guarded.from('economic_shadow_projections').insert(row);
  if (error) return { ok: false, reason: 'projection_write_failed' };
  return { ok: true, observation, reused: false };
}

function attributionStatusOf(row: unknown): 'attributed' | 'unattributed' | 'unresolved' {
  const status = (row as { attribution_status?: string } | null)?.attribution_status;
  if (status === 'attributed' || status === 'unresolved') return status;
  return 'unattributed';
}

function attributionMethodFromConversion(
  row: { attribution_meta?: unknown } | null,
): ShadowChainEvidence['attributionMethod'] {
  const meta = row?.attribution_meta;
  if (!meta || typeof meta !== 'object') return null;
  const method = (meta as { method?: unknown }).method;
  if (method === 'sub_id' || method === 'product_click_window' || method === 'manual') return method;
  return null;
}

function toRow(observation: ShadowObservation) {
  return {
    commission_id: observation.commissionId,
    conversion_id: observation.conversionId,
    click_id: observation.clickId,
    offer_id: observation.offerId,
    creator_user_id: observation.creatorUserId,
    rule_version: observation.ruleVersion,
    creator_share_bps: observation.creatorShareBps,
    gross_commission_cents: observation.grossCommissionCents,
    projected_creator_cents: observation.projectedCreatorCents,
    projected_platform_cents: observation.projectedPlatformCents,
    eligibility_status: observation.eligibilityStatus,
    reason: observation.reason,
    observation_kind: SHADOW_OBSERVATION_KIND,
    withdrawable: false,
  };
}

function guardMoneyWrites(supabase: SupabaseClient): SupabaseClient {
  const original = supabase.from.bind(supabase);
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop !== 'from') return Reflect.get(target, prop, receiver);
      return (table: string) => {
        const builder = original(table);
        if (!MONEY_TABLES.has(table)) return builder;
        return new Proxy(builder as object, {
          get(inner, key, innerReceiver) {
            if (key === 'insert' || key === 'update' || key === 'upsert' || key === 'delete') {
              return () => {
                throw new Error(`shadow_money_write_forbidden:${table}`);
              };
            }
            return Reflect.get(inner, key, innerReceiver);
          },
        });
      };
    },
  });
}
