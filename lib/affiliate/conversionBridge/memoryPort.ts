/**
 * Puerto en memoria para pruebas.
 * Respeta el mismo cierre que producción: sin puente de settlement no hay asiento,
 * y nunca hay payout. Una reversión no borra el original.
 */

import type { CommissionStatus, ConversionStatus } from '@/lib/economy/types';
import type { ImportBatch } from './importEngine';
import type { CommissionWrite, ConversionWrite, EconomicPort } from './executeImport';

type StoredConversion = ConversionWrite & { id: string; history: string[] };
type StoredCommission = CommissionWrite & { id: string; ledgerEntryId: string | null; history: string[] };

export type MemoryEconomy = {
  conversions: StoredConversion[];
  commissions: StoredCommission[];
  ledger: Array<{ id: string; commissionId: string; amountCents: number; kind: 'original' | 'compensating' }>;
  payouts: unknown[];
  batches: ImportBatch[];
};

export function createMemoryEconomicPort(input?: {
  settlementEnabled?: boolean;
  moneyPathFrozen?: boolean;
}): { port: EconomicPort; state: MemoryEconomy } {
  const settlementEnabled = input?.settlementEnabled === true;
  const moneyPathFrozen = input?.moneyPathFrozen !== false;
  const state: MemoryEconomy = {
    conversions: [],
    commissions: [],
    ledger: [],
    payouts: [],
    batches: [],
  };

  const port: EconomicPort = {
    async insertBatch(batch) {
      state.batches.push(batch);
      return { ok: true };
    },
    async insertConversion(row) {
      const found = state.conversions.find((item) => item.externalConversionId === row.externalConversionId);
      if (found) return { ok: true, reused: true, id: found.id };
      const id = `conv-${state.conversions.length + 1}`;
      state.conversions.push({ ...row, id, history: [row.status] });
      return { ok: true, reused: false, id };
    },
    async insertCommission(row) {
      const found = state.commissions.find((item) => item.externalCommissionId === row.externalCommissionId);
      if (found) return { ok: true, reused: true, id: found.id };
      const id = `com-${state.commissions.length + 1}`;
      state.commissions.push({ ...row, id, ledgerEntryId: null, history: [row.status] });
      return { ok: true, reused: false, id };
    },
    async transitionConversion(input: { externalConversionId: string; toStatus: ConversionStatus; canonicalStatus: string }) {
      const found = state.conversions.find((item) => item.externalConversionId === input.externalConversionId);
      if (!found) return { ok: false };
      found.history.push(input.toStatus);
      found.status = input.toStatus;
      found.canonicalStatus = input.canonicalStatus;
      found.rawReference = { ...found.rawReference, canonical_status: input.canonicalStatus };
      return { ok: true };
    },
    async transitionCommission(input: { externalCommissionId: string; toStatus: CommissionStatus }) {
      const found = state.commissions.find((item) => item.externalCommissionId === input.externalCommissionId);
      if (!found) return { ok: false, compensated: false, originalDeleted: false };
      found.history.push(input.toStatus);
      found.status = input.toStatus;
      let compensated = false;
      if (input.toStatus === 'reversed' && found.ledgerEntryId && settlementEnabled && !moneyPathFrozen) {
        state.ledger.push({
          id: `ledger-rev-${found.id}`,
          commissionId: found.id,
          amountCents: -found.grossCommissionCents,
          kind: 'compensating',
        });
        compensated = true;
      }
      return { ok: true, compensated, originalDeleted: false };
    },
    async requestSettlement(externalCommissionId) {
      const found = state.commissions.find((item) => item.externalCommissionId === externalCommissionId);
      if (!found || found.status !== 'approved') return { ledgerWritten: false, payoutWritten: false };
      if (!settlementEnabled || moneyPathFrozen || found.ledgerEntryId) {
        return { ledgerWritten: false, payoutWritten: false };
      }
      const id = `ledger-${found.id}`;
      found.ledgerEntryId = id;
      state.ledger.push({ id, commissionId: found.id, amountCents: found.grossCommissionCents, kind: 'original' });
      return { ledgerWritten: true, payoutWritten: false };
    },
  };

  return { port, state };
}
