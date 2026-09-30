import { classifyLedgerEconomicKind } from '@/lib/economy/readModel/classifyLedgerRow';
import { resolveEconomicPeriod } from '@/lib/economy/readModel/economicPeriod';

export type EconomicAnomaly = {
  code: string;
  severity: 'attention' | 'info';
  explanation: string;
  entityId?: string;
};

export type LedgerFoldRow = {
  id: string;
  network: string;
  amountCents: number;
  externalRef?: string | null;
  source?: string | null;
  notes?: string | null;
  meta?: unknown;
  trackingTag?: string | null;
  periodStart?: string | null;
  createdAt: string;
};

export type RewardFoldRow = {
  id: string;
  ledgerEntryId: string;
  status: string;
  creatorShareCents: number;
  platformShareCents: number;
  holdUntil?: string | null;
};

const LIABILITY_STATUSES = new Set(['PENDING', 'VALIDATING', 'AVAILABLE', 'PAID']);

export function foldNetworkEconomy(rows: LedgerFoldRow[], period: string) {
  let gross = 0;
  let reversalSigned = 0;
  let evidenceRows = 0;
  const byNetwork = new Map<string, { gross: number; reversals: number }>();
  const anomalies: EconomicAnomaly[] = [];
  const settlementIds: string[] = [];
  const lines: { id: string; network: string; kind: 'settlement' | 'reversal'; cents: number; externalRef: string }[] = [];
  const seenRefs = new Set<string>();

  for (const row of rows) {
    const kind = classifyLedgerEconomicKind(row);
    if (kind === 'synthetic') continue;
    const resolved = resolveEconomicPeriod({
      periodStart: row.periodStart,
      createdAt: row.createdAt,
    });
    if (resolved.anomaly === 'period_mismatch') {
      anomalies.push({
        code: 'period_mismatch',
        severity: 'attention',
        explanation: 'period_start y created_at caen en meses distintos. La fila no entra en el reconocido.',
        entityId: row.id,
      });
      continue;
    }
    if (resolved.period !== period) continue;
    if (kind === 'evidence') {
      evidenceRows += 1;
      continue;
    }
    if (kind === 'unscoped_api') {
      anomalies.push({
        code: 'unscoped_api',
        severity: 'attention',
        explanation: 'Fila source=api sin prefijo settlement. No es comisión reconocida.',
        entityId: row.id,
      });
      continue;
    }
    const refKey = (row.externalRef ?? '').trim().toLowerCase();
    if (seenRefs.has(refKey)) {
      anomalies.push({
        code: 'duplicate_external_ref',
        severity: 'attention',
        explanation: 'Dos filas del libro comparten external_ref. La segunda no se suma.',
        entityId: row.id,
      });
      continue;
    }
    seenRefs.add(refKey);
    const bucket = byNetwork.get(row.network) ?? { gross: 0, reversals: 0 };
    if (kind === 'settlement') {
      gross += row.amountCents;
      bucket.gross += row.amountCents;
      settlementIds.push(row.id);
      lines.push({
        id: row.id,
        network: row.network,
        kind: 'settlement',
        cents: row.amountCents,
        externalRef: row.externalRef ?? '',
      });
    } else {
      reversalSigned += row.amountCents;
      bucket.reversals += row.amountCents;
      lines.push({
        id: row.id,
        network: row.network,
        kind: 'reversal',
        cents: row.amountCents,
        externalRef: row.externalRef ?? '',
      });
    }
    byNetwork.set(row.network, bucket);
  }

  return {
    grossRecognizedCents: gross,
    reversalCents: reversalSigned,
    netRecognizedCents: gross + reversalSigned,
    evidenceRows,
    byNetwork: [...byNetwork.entries()].map(([network, totals]) => ({ network, ...totals })),
    settlementIds,
    lines: lines.slice(0, 12),
    anomalies,
  };
}

export function foldCreatorRewards(rewards: RewardFoldRow[], settlementIds: ReadonlySet<string>) {
  let liability = 0;
  let aventa = 0;
  let validating = 0;
  let available = 0;
  let paid = 0;
  let hold = 0;
  const anomalies: EconomicAnomaly[] = [];
  const seenLedger = new Set<string>();
  const rewardIds: string[] = [];

  for (const reward of rewards) {
    if (!settlementIds.has(reward.ledgerEntryId)) {
      anomalies.push({
        code: 'reward_outside_period_settlement',
        severity: 'info',
        explanation: 'Recompensa cuyo libro no está en el settlement de este periodo. No se suma aquí.',
        entityId: reward.id,
      });
      continue;
    }
    if (seenLedger.has(reward.ledgerEntryId)) {
      anomalies.push({
        code: 'duplicate_reward_ledger',
        severity: 'attention',
        explanation: 'Dos recompensas apuntan al mismo ledger_entry_id. La segunda no se suma.',
        entityId: reward.id,
      });
      continue;
    }
    seenLedger.add(reward.ledgerEntryId);
    rewardIds.push(reward.id);
    if (!LIABILITY_STATUSES.has(reward.status)) continue;
    liability += reward.creatorShareCents;
    aventa += reward.platformShareCents;
    if (reward.status === 'VALIDATING') {
      validating += reward.creatorShareCents;
      hold += reward.creatorShareCents;
    } else if (reward.status === 'AVAILABLE') available += reward.creatorShareCents;
    else if (reward.status === 'PAID') paid += reward.creatorShareCents;
    else if (reward.status === 'PENDING') hold += reward.creatorShareCents;
  }

  return { liability, aventa, validating, available, paid, hold, rewardIds, anomalies };
}

export type PayoutFoldRow = {
  id: string;
  rewardId: string;
  status: string;
  amountCents: number;
};

export function foldPayoutIntents(rows: PayoutFoldRow[], rewardIds: ReadonlySet<string>) {
  const counts = { reserved: 0, submitted: 0, succeeded: 0, failed: 0, unknown: 0, cancelled: 0 };
  let succeededCents = 0;
  const anomalies: EconomicAnomaly[] = [];
  const seenReward = new Set<string>();

  for (const row of rows) {
    if (!rewardIds.has(row.rewardId)) {
      anomalies.push({
        code: 'payout_outside_period_reward',
        severity: 'info',
        explanation: 'Intent cuyo reward no está en la obligación de este periodo. No entra en la operación del periodo.',
        entityId: row.id,
      });
      continue;
    }
    if (seenReward.has(row.rewardId)) {
      anomalies.push({
        code: 'duplicate_payout_reward',
        severity: 'attention',
        explanation: 'Dos intents apuntan al mismo reward. El segundo no se cuenta.',
        entityId: row.id,
      });
      continue;
    }
    seenReward.add(row.rewardId);
    const status = row.status.toUpperCase();
    if (status === 'RESERVED') counts.reserved += 1;
    else if (status === 'SUBMITTED') counts.submitted += 1;
    else if (status === 'SUCCEEDED') {
      counts.succeeded += 1;
      succeededCents += row.amountCents;
    } else if (status === 'FAILED') counts.failed += 1;
    else if (status === 'UNKNOWN') counts.unknown += 1;
    else if (status === 'CANCELLED') counts.cancelled += 1;
  }

  return { counts, succeededCents, anomalies };
}
