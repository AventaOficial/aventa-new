/**
 * Money System Foundation — identity / chain documentation helpers (pure).
 * Does not create parallel SoT tables.
 */

export const MONEY_SYSTEM_AUTHORITIES = {
  click: {
    table: 'reward_outbound_clicks',
    writer: 'lib/attribution/recordAttributedClick.ts#recordAttributedClick',
    volumeTable: 'offer_events',
  },
  conversion: {
    table: 'affiliate_conversions',
    writer: 'lib/economy/recordConversion.ts#recordConversion',
    unique: 'UNIQUE(source, network, external_conversion_id)',
  },
  commission: {
    table: 'affiliate_commissions',
    writer: 'lib/economy/recordCommission.ts#recordCommission',
    unique: 'UNIQUE(source, network, external_commission_id)',
    doubleCredit: 'UNIQUE(conversion_id) — one conversion → one commission row',
    ledgerLink: 'ledger_entry_id always null in foundation/shadow',
  },
  economicAudit: {
    table: 'affiliate_economic_events',
    writer: 'lib/economy/appendEconomicEvent.ts#appendEconomicEvent',
  },
  platformLedger: {
    table: 'affiliate_ledger_entries',
    writer:
      'lib/economy/settlement/settleCommission.ts + executeSettlementReversal (canonical). Network CSV/manual is evidence ingest only — no rewards.',
    note: 'Single SoT table. CSV/admin POST ingest network reports; settlement bridge owns commission→ledger.',
  },
  reward: {
    table: 'creator_rewards',
    writer: 'lib/rewards/rewardsEngine.ts#createRewardFromLedgerEntry',
    note: 'requires unfrozen money path + REWARDS_PROGRAM_ACTIVE — not shadow',
  },
} as const;

export const MONEY_SYSTEM_CHAIN = [
  'offer',
  'click',
  'attribution',
  'conversion',
  'commission',
  'ledger',
  'allocation',
  'reward',
] as const;

export type MoneySystemChainStep = (typeof MONEY_SYSTEM_CHAIN)[number];
