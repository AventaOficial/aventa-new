-- Cohorte Rewards beta. Append-only: no se borra historia.
-- El porcentaje no se guarda aquí. Cada fila apunta a rewards rule version del código.
-- No aplicar en producción hasta cerrar la beta. No activa pagos.

create table if not exists public.rewards_beta_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  status text not null check (status in ('invited', 'enrolled', 'suspended', 'removed')),
  rule_version text not null,
  reason text not null,
  acted_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists rewards_beta_memberships_user_created_idx
  on public.rewards_beta_memberships (user_id, created_at desc);

alter table public.rewards_beta_memberships enable row level security;
