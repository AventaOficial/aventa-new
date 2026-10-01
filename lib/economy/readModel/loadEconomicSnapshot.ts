import { createServerClient } from '@/lib/supabase/server';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { foldCreatorRewards, foldNetworkEconomy, foldPayoutIntents, type EconomicAnomaly, type LedgerFoldRow, type PayoutFoldRow, type RewardFoldRow } from '@/lib/economy/readModel/aggregateEconomicSnapshot';
import { monthYmdRange } from '@/lib/owner/mxTime';
import { currentEconomicPeriod, ECONOMIC_PERIOD_TZ } from '@/lib/economy/readModel/economicPeriod';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';
import { isRewardsProgramActive } from '@/lib/rewards/programStatus';

export type MoneyState =
  | { state: 'amount'; cents: number }
  | { state: 'not_implemented'; reason: string }
  | { state: 'no_data'; reason: string }
  | { state: 'none'; reason: string };

export type EconomicSnapshot = {
  period: string;
  networkEconomy: {
    state: 'ready' | 'no_data';
    grossRecognized: MoneyState;
    reversals: MoneyState;
    netRecognized: MoneyState;
    evidenceRows: number;
    byNetwork: { network: string; gross: number; reversals: number }[];
    lines: { id: string; network: string; kind: 'settlement' | 'reversal'; cents: number; externalRef: string }[];
  };
  contributionEconomy: {
    budget: MoneyState;
    unused: MoneyState;
    note: string;
  };
  creatorEconomy: {
    state: 'ready' | 'no_data' | 'none';
    creatorLiability: MoneyState;
    aventaShare: MoneyState;
    validating: MoneyState;
    available: MoneyState;
    paid: MoneyState;
    onHold: MoneyState;
  };
  payoutOps: {
    state: 'ready' | 'no_data' | 'none';
    reserved: number;
    submitted: number;
    succeeded: number;
    failed: number;
    unknown: number;
    cancelled: number;
    succeededAmount: MoneyState;
  };
  anomalies: EconomicAnomaly[];
  monetizationStatus: {
    moneyPathFrozen: boolean;
    rewardsProgramActive: boolean;
    commissionProgramActive: boolean;
    label: string;
  };
};

const LEDGER_CAP = 4000;

function amount(cents: number): MoneyState {
  return { state: 'amount', cents };
}

function noneIfZero(cents: number, reason: string): MoneyState {
  if (cents === 0) return { state: 'none', reason };
  return { state: 'amount', cents };
}

export async function loadEconomicSnapshot(period = currentEconomicPeriod()): Promise<EconomicSnapshot> {
  const supabase = createServerClient();
  const range = monthYmdRange(new Date(`${period}-15T18:00:00.000Z`), ECONOMIC_PERIOD_TZ);
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const periodEndExclusive =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const anomalies: EconomicAnomaly[] = [];

  const [byCreated, byPeriod] = await Promise.all([
    supabase
      .from('affiliate_ledger_entries')
      .select('id, network, amount_cents, external_ref, source, notes, meta, tracking_tag, period_start, created_at, status')
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .limit(LEDGER_CAP),
    supabase
      .from('affiliate_ledger_entries')
      .select('id, network, amount_cents, external_ref, source, notes, meta, tracking_tag, period_start, created_at, status')
      .gte('period_start', `${period}-01`)
      .lt('period_start', periodEndExclusive)
      .limit(LEDGER_CAP),
  ]);

  const ledgerMissing = Boolean(byCreated.error || byPeriod.error);
  const merged = new Map<string, LedgerFoldRow>();
  if (!ledgerMissing) {
    for (const raw of [...(byCreated.data ?? []), ...(byPeriod.data ?? [])]) {
      const row = raw as Record<string, unknown>;
      const id = String(row.id);
      merged.set(id, {
        id,
        network: String(row.network ?? ''),
        amountCents: Number(row.amount_cents) || 0,
        externalRef: (row.external_ref as string | null) ?? null,
        source: (row.source as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        meta: row.meta,
        trackingTag: (row.tracking_tag as string | null) ?? null,
        periodStart: (row.period_start as string | null) ?? null,
        createdAt: String(row.created_at),
      });
    }
    if ((byCreated.data?.length ?? 0) >= LEDGER_CAP || (byPeriod.data?.length ?? 0) >= LEDGER_CAP) {
      anomalies.push({
        code: 'ledger_truncated',
        severity: 'attention',
        explanation: 'Este periodo tiene más filas de las que esta lectura recorre. El total puede estar incompleto.',
      });
    }
  }

  const network = ledgerMissing
    ? null
    : foldNetworkEconomy([...merged.values()], period);
  if (network) anomalies.push(...network.anomalies);

  let creator: ReturnType<typeof foldCreatorRewards> | null = null;
  let creatorState: EconomicSnapshot['creatorEconomy']['state'] = 'none';
  if (network && network.settlementIds.length > 0) {
    const rewards: RewardFoldRow[] = [];
    let rewardError = false;
    for (let i = 0; i < network.settlementIds.length; i += 150) {
      const chunk = network.settlementIds.slice(i, i + 150);
      const { data, error } = await supabase
        .from('creator_rewards')
        .select('id, ledger_entry_id, status, creator_share_cents, platform_share_cents, hold_until')
        .in('ledger_entry_id', chunk);
      if (error) {
        rewardError = true;
        break;
      }
      for (const raw of data ?? []) {
        const row = raw as Record<string, unknown>;
        rewards.push({
          id: String(row.id),
          ledgerEntryId: String(row.ledger_entry_id),
          status: String(row.status ?? ''),
          creatorShareCents: Number(row.creator_share_cents) || 0,
          platformShareCents: Number(row.platform_share_cents) || 0,
          holdUntil: (row.hold_until as string | null) ?? null,
        });
      }
    }
    if (rewardError) creatorState = 'no_data';
    else {
      creator = foldCreatorRewards(rewards, new Set(network.settlementIds));
      anomalies.push(...creator.anomalies);
      creatorState = creator.liability === 0 ? 'none' : 'ready';
    }
  }

  let payoutOps: EconomicSnapshot['payoutOps'] = {
    state: 'none',
    reserved: 0,
    submitted: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0,
    succeededAmount: { state: 'none', reason: 'Sin intents de pago en este periodo.' },
  };
  if (creator && creator.rewardIds.length > 0) {
    const intents: PayoutFoldRow[] = [];
    let payoutError = false;
    for (let i = 0; i < creator.rewardIds.length; i += 150) {
      const chunk = creator.rewardIds.slice(i, i + 150);
      const { data, error } = await supabase
        .from('payout_intents')
        .select('id, reward_id, status, amount_cents')
        .in('reward_id', chunk);
      if (error) {
        payoutError = true;
        break;
      }
      for (const raw of data ?? []) {
        const row = raw as Record<string, unknown>;
        intents.push({
          id: String(row.id),
          rewardId: String(row.reward_id),
          status: String(row.status ?? ''),
          amountCents: Number(row.amount_cents) || 0,
        });
      }
    }
    if (payoutError) {
      payoutOps = {
        ...payoutOps,
        state: 'no_data',
        succeededAmount: { state: 'no_data', reason: 'No se pudo leer payout_intents.' },
      };
    } else {
      const folded = foldPayoutIntents(intents, new Set(creator.rewardIds));
      anomalies.push(...folded.anomalies);
      payoutOps = {
        state: 'ready',
        ...folded.counts,
        succeededAmount: noneIfZero(folded.succeededCents, 'Ningún intent de este periodo quedó resuelto.'),
      };
    }
  }

  const frozen = isMoneyPathFrozen();
  const rewardsOn = isRewardsProgramActive();
  const commissionsOn = isCommissionProgramPubliclyActive();
  const label = frozen
    ? 'Monetización congelada. El libro puede tener comisiones reconocidas. Eso no enciende pagos.'
    : rewardsOn
      ? 'Programa de recompensas activo.'
      : 'Money path abierto en este runtime y el programa de recompensas sigue apagado.';

  const noReward = { state: 'none' as const, reason: 'Sin obligaciones de creador en el settlement de este periodo.' };
  const rewardNoData = { state: 'no_data' as const, reason: 'No se pudo leer creator_rewards.' };

  return {
    period,
    networkEconomy: network
      ? {
          state: 'ready',
          grossRecognized: amount(network.grossRecognizedCents),
          reversals: amount(network.reversalCents),
          netRecognized: amount(network.netRecognizedCents),
          evidenceRows: network.evidenceRows,
          byNetwork: network.byNetwork,
          lines: network.lines,
        }
      : {
          state: 'no_data',
          grossRecognized: { state: 'no_data', reason: 'No se pudo leer el libro.' },
          reversals: { state: 'no_data', reason: 'No se pudo leer el libro.' },
          netRecognized: { state: 'no_data', reason: 'No se pudo leer el libro.' },
          evidenceRows: 0,
          byNetwork: [],
          lines: [],
        },
    contributionEconomy: {
      budget: {
        state: 'not_implemented',
        reason: 'Programa de contribución no implementado. No es un presupuesto en cero.',
      },
      unused: {
        state: 'not_implemented',
        reason: 'Sin bolsa no hay saldo sin usar.',
      },
      note: 'Contribution Rewards no está construido. El 40 % histórico del código no se convierte aquí en una bolsa.',
    },
    creatorEconomy: {
      state: creatorState,
      creatorLiability:
        creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.liability, noReward.reason) : noReward,
      aventaShare:
        creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.aventa, noReward.reason) : noReward,
      validating:
        creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.validating, 'Nada en validación.') : noReward,
      available:
        creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.available, 'Nada disponible.') : noReward,
      paid: creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.paid, 'Nada pagado.') : noReward,
      onHold: creatorState === 'no_data' ? rewardNoData : creator ? noneIfZero(creator.hold, 'Nada en hold.') : noReward,
    },
    payoutOps,
    anomalies,
    monetizationStatus: {
      moneyPathFrozen: frozen,
      rewardsProgramActive: rewardsOn,
      commissionProgramActive: commissionsOn,
      label,
    },
  };
}
