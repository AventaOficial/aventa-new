-- Economic Beta: observación shadow y candidatos de orden.
-- No liquida dinero. No escribe creator_rewards, affiliate_ledger_entries,
-- ledger_settlements ni payout_intents.
-- Idempotente. Sin operaciones destructivas.

-- ── Proyección shadow (NON_WITHDRAWABLE / SHADOW_ONLY) ───────────────────────
create table if not exists public.economic_shadow_projections (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.affiliate_commissions (id) on delete restrict,
  conversion_id uuid null references public.affiliate_conversions (id) on delete restrict,
  click_id uuid null references public.reward_outbound_clicks (id) on delete restrict,
  offer_id uuid null references public.offers (id) on delete restrict,
  creator_user_id uuid null references public.profiles (id) on delete restrict,
  rule_version text not null,
  creator_share_bps integer not null check (creator_share_bps >= 0 and creator_share_bps <= 10000),
  gross_commission_cents bigint not null check (gross_commission_cents >= 0),
  projected_creator_cents bigint not null check (projected_creator_cents >= 0),
  projected_platform_cents bigint not null check (projected_platform_cents >= 0),
  eligibility_status text not null check (eligibility_status in ('eligible', 'ineligible')),
  reason text not null check (char_length(btrim(reason)) > 0),
  observation_kind text not null default 'SHADOW_ONLY' check (observation_kind = 'SHADOW_ONLY'),
  withdrawable boolean not null default false check (withdrawable = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint economic_shadow_projections_commission_unique unique (commission_id),
  constraint economic_shadow_projections_amounts_check check (
    (
      eligibility_status = 'ineligible'
      and projected_creator_cents = 0
      and projected_platform_cents = 0
    )
    or (
      eligibility_status = 'eligible'
      and projected_creator_cents + projected_platform_cents = gross_commission_cents
      and projected_creator_cents = (gross_commission_cents * creator_share_bps) / 10000
    )
  )
);

create index if not exists economic_shadow_projections_creator_created_idx
  on public.economic_shadow_projections (creator_user_id, created_at desc);

create index if not exists economic_shadow_projections_eligibility_created_idx
  on public.economic_shadow_projections (eligibility_status, created_at desc);

comment on table public.economic_shadow_projections is
  'NON_WITHDRAWABLE. SHADOW_ONLY. Observación reproducible de una comisión. No es saldo, no es ledger y no puede convertirse en payout.';

comment on column public.economic_shadow_projections.rule_version is
  'Versión de la regla usada en la primera observación. No se reemplaza si la regla vigente cambia.';

comment on column public.economic_shadow_projections.creator_share_bps is
  'Basis points aplicados en la primera observación. El recálculo usa este valor, no el porcentaje vigente.';

-- ── Identidad explícita de orden entre canales ───────────────────────────────
-- external_conversion_id sigue siendo único por (source, network, id).
-- No se asume que ese id sea el mismo entre webhook y csv.
-- Solo se registra una clave canónica cuando el canal la entrega explícita.
-- Varias filas con la misma clave no fusionan ni bloquean conversiones.
create table if not exists public.economic_order_reconciliation_candidates (
  id uuid primary key default gen_random_uuid(),
  network text not null,
  canonical_order_key text not null check (char_length(btrim(canonical_order_key)) > 0),
  conversion_id uuid not null references public.affiliate_conversions (id) on delete restrict,
  source text not null,
  created_at timestamptz not null default now(),
  constraint economic_order_candidates_identity_unique
    unique (network, canonical_order_key, conversion_id)
);

create index if not exists economic_order_candidates_key_idx
  on public.economic_order_reconciliation_candidates (network, canonical_order_key);

comment on table public.economic_order_reconciliation_candidates is
  'Candidato de reconciliación. No fusiona conversiones ni impide ingestas distintas. Sin clave explícita no hay fila.';

-- ── Lectura agregada de la cohorte ───────────────────────────────────────────
create index if not exists idx_reward_outbound_clicks_created
  on public.reward_outbound_clicks (created_at);

create or replace function public.economic_beta_report(
  p_user_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
with latest_membership as (
  select distinct on (m.user_id) m.user_id, m.status
  from public.rewards_beta_memberships m
  order by m.user_id, m.created_at desc
),
enrolled as (
  select user_id
  from latest_membership
  where status = 'enrolled'
    and (p_user_id is null or user_id = p_user_id)
),
click_stats as (
  select
    count(*)::bigint as attributed_clicks,
    count(distinct coalesce(nullif(btrim(c.idempotency_key), ''), c.id::text))::bigint as unique_attributed_clicks
  from public.reward_outbound_clicks c
  join public.offers o on o.id = c.offer_id
  join enrolled e on e.user_id = o.created_by
  where (p_from is null or c.created_at >= p_from)
    and (p_to is null or c.created_at < p_to)
),
conversion_stats as (
  select
    count(*)::bigint as conversions,
    count(*) filter (
      where v.attribution_status in ('unattributed', 'unresolved')
    )::bigint as attribution_failures
  from public.affiliate_conversions v
  join public.offers o on o.id = v.offer_id
  join enrolled e on e.user_id = o.created_by
  where (p_from is null or v.occurred_at >= p_from)
    and (p_to is null or v.occurred_at < p_to)
),
commission_stats as (
  select
    count(*) filter (where m.status = 'reported')::bigint as reported_commissions,
    count(*) filter (where m.status = 'approved')::bigint as approved_commissions,
    count(*) filter (where m.status = 'reversed')::bigint as reversed_commissions
  from public.affiliate_commissions m
  join public.affiliate_conversions v on v.id = m.conversion_id
  join public.offers o on o.id = v.offer_id
  join enrolled e on e.user_id = o.created_by
  where (p_from is null or m.occurred_at >= p_from)
    and (p_to is null or m.occurred_at < p_to)
),
projection_stats as (
  select
    coalesce(sum(p.projected_creator_cents), 0)::bigint as projected_creator_rewards,
    coalesce(sum(p.projected_creator_cents) filter (where p.eligibility_status = 'eligible'), 0)::bigint as eligible_projected_rewards,
    count(*) filter (where p.eligibility_status = 'ineligible')::bigint as ineligible_projections,
    count(*) filter (
      where p.eligibility_status = 'eligible'
        and p.projected_creator_cents <> (p.gross_commission_cents * p.creator_share_bps) / 10000
    )::bigint as calculation_mismatches
  from public.economic_shadow_projections p
  join enrolled e on e.user_id = p.creator_user_id
  where (p_from is null or p.created_at >= p_from)
    and (p_to is null or p.created_at < p_to)
),
duplicate_stats as (
  select count(*)::bigint as duplicate_conversions
  from (
    select c.network, c.canonical_order_key
    from public.economic_order_reconciliation_candidates c
    join public.affiliate_conversions v on v.id = c.conversion_id
    join public.offers o on o.id = v.offer_id
    join enrolled e on e.user_id = o.created_by
    where (p_from is null or v.occurred_at >= p_from)
      and (p_to is null or v.occurred_at < p_to)
    group by c.network, c.canonical_order_key
    having count(distinct c.conversion_id) > 1
  ) grouped
)
select jsonb_build_object(
  'cohort', 'rewards_beta',
  'enrolledUsers', (select count(*) from enrolled),
  'attributedClicks', (select attributed_clicks from click_stats),
  'uniqueAttributedClicks', (select unique_attributed_clicks from click_stats),
  'conversions', (select conversions from conversion_stats),
  'reportedCommissions', (select reported_commissions from commission_stats),
  'approvedCommissions', (select approved_commissions from commission_stats),
  'reversedCommissions', (select reversed_commissions from commission_stats),
  'projectedCreatorRewardsCents', (select projected_creator_rewards from projection_stats),
  'eligibleProjectedRewardsCents', (select eligible_projected_rewards from projection_stats),
  'ineligibleProjections', (select ineligible_projections from projection_stats),
  'attributionFailures', (select attribution_failures from conversion_stats),
  'duplicateConversions', (select duplicate_conversions from duplicate_stats),
  'reversalRate', (
    select case
      when approved_commissions + reversed_commissions = 0 then null
      else reversed_commissions::numeric / (approved_commissions + reversed_commissions)
    end
    from commission_stats
  ),
  'calculationMismatches', (select calculation_mismatches from projection_stats)
);
$fn$;

comment on function public.economic_beta_report(uuid, timestamptz, timestamptz) is
  'Lectura agregada de Economic Beta. No mueve dinero. Solo service_role.';

revoke all on function public.economic_beta_report(uuid, timestamptz, timestamptz) from public;
revoke all on function public.economic_beta_report(uuid, timestamptz, timestamptz) from anon;
revoke all on function public.economic_beta_report(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.economic_beta_report(uuid, timestamptz, timestamptz) to service_role;

alter table public.economic_shadow_projections enable row level security;
alter table public.economic_order_reconciliation_candidates enable row level security;

revoke all on table public.economic_shadow_projections from public;
revoke all on table public.economic_shadow_projections from anon;
revoke all on table public.economic_shadow_projections from authenticated;
grant all on table public.economic_shadow_projections to service_role;

revoke all on table public.economic_order_reconciliation_candidates from public;
revoke all on table public.economic_order_reconciliation_candidates from anon;
revoke all on table public.economic_order_reconciliation_candidates from authenticated;
grant all on table public.economic_order_reconciliation_candidates to service_role;
