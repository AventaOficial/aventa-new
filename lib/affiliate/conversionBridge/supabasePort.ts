/**
 * Puerto de producción. Escribe solo por recordConversion / recordCommission /
 * sus transiciones y settleCommission. No llama al motor de rewards ni a payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordCommission, transitionCommissionStatus } from '@/lib/economy/recordCommission';
import { recordConversion, transitionConversionStatus } from '@/lib/economy/recordConversion';
import { settleCommission } from '@/lib/economy/settlement/settleCommission';
import type { ImportBatch } from './importEngine';
import type { CommissionWrite, ConversionWrite, EconomicPort } from './executeImport';

const ACTOR = 'affiliate_conversion_bridge';

export function createSupabaseEconomicPort(supabase: SupabaseClient): EconomicPort {
  const conversionIds = new Map<string, string>();
  const commissionIds = new Map<string, string>();

  async function conversionIdFor(externalConversionId: string): Promise<string | null> {
    const cached = conversionIds.get(externalConversionId);
    if (cached) return cached;
    const { data } = await supabase
      .from('affiliate_conversions')
      .select('id')
      .eq('source', 'csv_import')
      .eq('network', 'mercadolibre')
      .eq('external_conversion_id', externalConversionId)
      .maybeSingle();
    const id = typeof data?.id === 'string' ? data.id : null;
    if (id) conversionIds.set(externalConversionId, id);
    return id;
  }

  async function commissionIdFor(externalCommissionId: string): Promise<string | null> {
    const cached = commissionIds.get(externalCommissionId);
    if (cached) return cached;
    const { data } = await supabase
      .from('affiliate_commissions')
      .select('id')
      .eq('source', 'csv_import')
      .eq('network', 'mercadolibre')
      .eq('external_commission_id', externalCommissionId)
      .maybeSingle();
    const id = typeof data?.id === 'string' ? data.id : null;
    if (id) commissionIds.set(externalCommissionId, id);
    return id;
  }

  return {
    async insertBatch(batch: ImportBatch) {
      const { error } = await supabase.from('affiliate_import_batches').insert({
        id: batch.batchId,
        provider: batch.provider,
        source_mode: batch.sourceMode,
        schema_version: batch.schemaVersion,
        status: batch.status,
        test_data: batch.testData,
        imported_at: batch.importedAt,
        provider_data_at: batch.providerDataAt,
        row_count: batch.rowCount,
        accepted: batch.accepted,
        rejected: batch.rejected,
        duplicates: batch.duplicates,
        unmatched: batch.unmatched,
        confirmed: batch.confirmed,
        reversed: batch.reversed,
        error_code: batch.errorCode,
        errors: batch.rows
          .filter((row) => row.disposition !== 'accepted')
          .map((row) => ({
            row: row.rowReference,
            external_conversion_id: row.disposition === 'duplicate' ? row.externalConversionId : row.externalConversionId,
            flags: row.qualityFlags,
          })),
      });
      return { ok: !error };
    },
    async insertConversion(row: ConversionWrite) {
      const created = await recordConversion(supabase, {
        source: 'csv_import',
        network: 'mercadolibre',
        externalConversionId: row.externalConversionId,
        occurredAt: row.occurredAt,
        clickId: row.clickId,
        offerId: row.offerId,
        status: row.status,
        currency: row.currency,
        rawReference: row.rawReference,
        actor: ACTOR,
      });
      if (!created) return { ok: false, reused: false, id: null };
      conversionIds.set(row.externalConversionId, created.conversionId);
      return { ok: true, reused: created.reused, id: created.conversionId };
    },
    async insertCommission(row: CommissionWrite) {
      const conversionId = await conversionIdFor(row.externalConversionId);
      if (!conversionId) return { ok: false, reused: false, id: null };
      const created = await recordCommission(supabase, {
        conversionId,
        source: 'csv_import',
        network: 'mercadolibre',
        externalCommissionId: row.externalCommissionId,
        grossCommissionCents: row.grossCommissionCents,
        currency: row.currency,
        occurredAt: row.occurredAt,
        status: row.status,
        rawReference: row.rawReference,
        actor: ACTOR,
      });
      if (!created) return { ok: false, reused: false, id: null };
      commissionIds.set(row.externalCommissionId, created.commissionId);
      return { ok: true, reused: created.reused, id: created.commissionId };
    },
    async transitionConversion(input) {
      const conversionId = await conversionIdFor(input.externalConversionId);
      if (!conversionId) return { ok: false };
      const existing = await supabase
        .from('affiliate_conversions')
        .select('raw_reference')
        .eq('id', conversionId)
        .maybeSingle();
      const raw = (existing.data?.raw_reference ?? {}) as Record<string, unknown>;
      const result = await transitionConversionStatus(supabase, {
        conversionId,
        toStatus: input.toStatus,
        actor: ACTOR,
        reason: input.canonicalStatus,
      });
      if (result.ok) {
        await supabase
          .from('affiliate_conversions')
          .update({
            raw_reference: { ...raw, canonical_status: input.canonicalStatus },
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversionId);
      }
      return { ok: result.ok };
    },
    async transitionCommission(input) {
      const commissionId = await commissionIdFor(input.externalCommissionId);
      if (!commissionId) return { ok: false, compensated: false, originalDeleted: false };
      const result = await transitionCommissionStatus(supabase, {
        commissionId,
        toStatus: input.toStatus,
        actor: ACTOR,
        reason: 'provider_reversal',
      });
      return {
        ok: result.ok,
        compensated: input.toStatus === 'reversed' && result.ok,
        originalDeleted: false,
      };
    },
    async requestSettlement(externalCommissionId) {
      const commissionId = await commissionIdFor(externalCommissionId);
      if (!commissionId) return { ledgerWritten: false, payoutWritten: false };
      const settled = await settleCommission(supabase, { commissionId, actor: ACTOR });
      return {
        ledgerWritten: settled.ok === true && settled.createdPayout === false && settled.ledgerEntryId != null,
        payoutWritten: false,
      };
    },
  };
}
