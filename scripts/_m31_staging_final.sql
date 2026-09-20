select
  (select count(*) from creator_rewards) as cr,
  (select count(*) from reward_payouts) as rp,
  (select count(*) from ledger_settlements) as ls,
  (select count(*) from reward_audit_log) as audit,
  (select count(*) from affiliate_ledger_entries) as ledger,
  (select attributable::text from affiliate_ledger_entries where id = '6537988e-5432-492d-9d99-7ade8119a9a4') as m2_attr,
  (select creator_id::text from affiliate_ledger_entries where id = '6537988e-5432-492d-9d99-7ade8119a9a4') as m2_creator,
  (select click_id::text from affiliate_ledger_entries where id = '6537988e-5432-492d-9d99-7ade8119a9a4') as m2_click;
