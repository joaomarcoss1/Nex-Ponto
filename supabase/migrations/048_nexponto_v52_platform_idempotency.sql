-- NexPonto v5.2 — reserva idempotente para operações externas da plataforma.

create table if not exists public.platform_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  response_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(actor_user_id,operation,idempotency_key)
);
alter table public.platform_idempotency_keys enable row level security;
revoke all on public.platform_idempotency_keys from public,anon,authenticated;
create index if not exists idx_platform_idempotency_created_v52
  on public.platform_idempotency_keys(created_at);

