/**
 * Ejecuta un lote ya decidido.
 * La comisión confirmada pide el settlement existente; ese puente sigue cerrado
 * si el dinero está congelado. Este módulo no crea payouts ni rewards.
 */

import type { CommissionStatus, ConversionStatus } from '@/lib/economy/types';
import type { ImportBatch } from './importEngine';
import { evidencePayload } from './economics';

export type ConversionWrite = {
  externalConversionId: string;
  externalOrderId: string | null;
  clickId: string | null;
  offerId: string | null;
  status: ConversionStatus;
  occurredAt: string;
  grossCommissionCents: number | null;
  currency: string | null;
  canonicalStatus: string;
  hunterRewardEligible: boolean;
  actorType: string;
  campaignKey: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  matchStatus: 'MATCHED' | 'UNMATCHED';
  rawReference: Record<string, unknown>;
};

export type CommissionWrite = {
  externalConversionId: string;
  externalCommissionId: string;
  status: CommissionStatus;
  grossCommissionCents: number;
  currency: string;
  occurredAt: string;
  rawReference: Record<string, unknown>;
};

export type EconomicPort = {
  insertBatch(batch: ImportBatch): Promise<{ ok: boolean }>;
  insertConversion(row: ConversionWrite): Promise<{ ok: boolean; reused: boolean; id: string | null }>;
  insertCommission(row: CommissionWrite): Promise<{ ok: boolean; reused: boolean; id: string | null }>;
  transitionConversion(input: { externalConversionId: string; toStatus: ConversionStatus; canonicalStatus: string }): Promise<{ ok: boolean }>;
  transitionCommission(input: { externalCommissionId: string; toStatus: CommissionStatus }): Promise<{ ok: boolean; compensated: boolean; originalDeleted: boolean }>;
  requestSettlement(externalCommissionId: string): Promise<{ ledgerWritten: boolean; payoutWritten: false }>;
};

export type ExecuteResult = {
  economicsWritten: number;
  commissionsWritten: number;
  settlementsWritten: number;
  compensationsWritten: number;
  payoutsCreated: 0;
  duplicates: number;
};

export async function executeImport(
  batch: ImportBatch,
  port: EconomicPort,
  options?: { allowTestProviderData?: boolean },
): Promise<ExecuteResult> {
  await port.insertBatch(batch);
  const result: ExecuteResult = {
    economicsWritten: 0,
    commissionsWritten: 0,
    settlementsWritten: 0,
    compensationsWritten: 0,
    payoutsCreated: 0,
    duplicates: batch.duplicates,
  };
  if (batch.testData && options?.allowTestProviderData !== true) return result;

  for (const row of batch.rows) {
    if (row.disposition !== 'accepted') continue;
    const event = row.event;
    const rawReference = evidencePayload(row.evidence, {
      canonical_status: row.decision.canonicalStatus,
      match_status: row.match.status,
      actor_type: row.match.actorType,
      hunter_reward_eligible: row.decision.hunterRewardEligible,
      hunter_user_id: row.decision.hunterRewardEligible ? row.match.hunterUserId : null,
      utm_source: row.match.campaign.utmSource,
      utm_medium: row.match.campaign.utmMedium,
      utm_campaign: row.match.campaign.utmCampaign,
      utm_content: row.match.campaign.utmContent,
      utm_term: row.match.campaign.utmTerm,
      quality_flags: row.qualityFlags,
      test_data: batch.testData,
      confirmed_commission_cents: row.decision.countsAsConfirmedSale ? event.grossCommissionCents : null,
    });
    const conversion: ConversionWrite = {
      externalConversionId: event.externalConversionId,
      externalOrderId: event.externalOrderId,
      clickId: row.match.clickId,
      offerId: row.match.offerId,
      status: row.decision.dbConversionStatus,
      occurredAt: event.occurredAt,
      grossCommissionCents: event.grossCommissionCents,
      currency: event.currency,
      canonicalStatus: row.decision.canonicalStatus,
      hunterRewardEligible: row.decision.hunterRewardEligible,
      actorType: row.match.actorType,
      campaignKey: row.match.campaign.utmCampaign,
      utmSource: row.match.campaign.utmSource,
      utmMedium: row.match.campaign.utmMedium,
      utmContent: row.match.campaign.utmContent,
      utmTerm: row.match.campaign.utmTerm,
      matchStatus: row.match.status,
      rawReference,
    };
    if (row.decision.createConversion) {
      const created = await port.insertConversion(conversion);
      if (created.ok && !created.reused) result.economicsWritten += 1;
      if (created.reused) result.duplicates += 1;
    } else if (row.decision.transitionConversion) {
      await port.transitionConversion({
        externalConversionId: event.externalConversionId,
        toStatus: row.decision.dbConversionStatus,
        canonicalStatus: row.decision.canonicalStatus,
      });
    }

    if (row.decision.dbCommissionStatus && event.grossCommissionCents != null && event.currency) {
      const commission: CommissionWrite = {
        externalConversionId: event.externalConversionId,
        externalCommissionId: `${event.externalConversionId}:commission`,
        status: row.decision.dbCommissionStatus,
        grossCommissionCents: event.grossCommissionCents,
        currency: event.currency,
        occurredAt: event.occurredAt,
        rawReference,
      };
      if (row.decision.createCommission) {
        const created = await port.insertCommission(commission);
        if (created.ok && !created.reused) result.commissionsWritten += 1;
      } else if (row.decision.transitionCommission) {
        const transitioned = await port.transitionCommission({
          externalCommissionId: commission.externalCommissionId,
          toStatus: row.decision.dbCommissionStatus,
        });
        if (transitioned.compensated) result.compensationsWritten += 1;
        if (transitioned.originalDeleted) {
          throw new Error('reversal_deleted_history');
        }
      }
      if (row.decision.requestSettlement) {
        const settled = await port.requestSettlement(commission.externalCommissionId);
        if (settled.ledgerWritten) result.settlementsWritten += 1;
        if (settled.payoutWritten) {
          throw new Error('payout_created');
        }
      }
    }
  }
  return result;
}
