select
  (select count(*) from creator_rewards) as cr,
  (select count(*) from reward_payouts) as rp,
  (select count(*) from ledger_settlements) as ls,
  (select count(*) from commission_pools) as pools;
