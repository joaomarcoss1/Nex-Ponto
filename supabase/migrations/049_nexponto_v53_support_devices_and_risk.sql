-- ============================================================
-- NexPonto v5.3
-- Suporte privilegiado, identidade de dispositivo e risco
-- VERSÃO CORRIGIDA / IDEMPOTENTE
-- ============================================================

-- ============================================================
-- 1. SUPPORT ACCESS SESSIONS
-- ============================================================

alter table public.support_access_sessions
  add column if not exists mfa_verified boolean not null default false,
  add column if not exists step_up_verified_at timestamptz,
  add column if not exists approved_at timestamptz;

update public.support_access_sessions
set scope = array['support_read']::text[]
where scope = array['support']::text[];


-- ============================================================
-- 2. AUTHORIZED DEVICES
-- ============================================================

alter table public.authorized_devices
  add column if not exists trust_level text not null default 'unverified',
  add column if not exists platform text,
  add column if not exists browser text,
  add column if not exists first_used_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null,
  add column if not exists revocation_reason text;


-- Adiciona a constraint separadamente para permitir reexecução segura.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'authorized_devices_trust_level_check'
      and conrelid = 'public.authorized_devices'::regclass
  ) then

    alter table public.authorized_devices
      add constraint authorized_devices_trust_level_check
      check (
        trust_level in (
          'unverified',
          'monitored',
          'trusted'
        )
      );

  end if;
end
$$;


update public.authorized_devices
set
  first_used_at = coalesce(first_used_at, created_at),
  trust_level = case
    when status = 'active' then 'trusted'
    else trust_level
  end;


-- ============================================================
-- 3. CONFIGURAÇÃO PADRÃO POR TENANT
-- ============================================================

insert into public.system_settings (
  tenant_id,
  key,
  value
)
select
  id,
  'authorized_device_mode',
  '"monitored"'::jsonb
from public.tenants
on conflict (tenant_id, key) do nothing;


-- ============================================================
-- 4. CLOCK RISK EVENTS
-- ============================================================

create table if not exists public.clock_risk_events (

  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null
    references public.tenants(id)
    on delete cascade,

  time_entry_id uuid not null
    references public.time_entries(id)
    on delete cascade,

  employee_id uuid not null
    references public.employees(id)
    on delete cascade,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  device_id uuid
    references public.authorized_devices(id)
    on delete set null,

  risk_score integer not null
    check (risk_score between 0 and 100),

  risk_level text not null
    check (
      risk_level in (
        'low',
        'medium',
        'high',
        'critical'
      )
    ),

  signals text[] not null default '{}',

  evidence jsonb not null default '{}'::jsonb,

  resolution_status text not null default 'pending'
    check (
      resolution_status in (
        'pending',
        'confirmed',
        'dismissed'
      )
    ),

  resolved_by uuid
    references auth.users(id)
    on delete set null,

  resolved_at timestamptz,

  resolution_reason text,

  created_at timestamptz not null default now(),

  unique (time_entry_id)
);


-- ============================================================
-- 5. RLS
-- ============================================================

alter table public.clock_risk_events
enable row level security;


-- Remove policies antigas para permitir executar novamente.

drop policy if exists clock_risk_tenant_read
on public.clock_risk_events;

drop policy if exists clock_risk_tenant_write
on public.clock_risk_events;


-- Remove permissões herdadas/default.

revoke all on table public.clock_risk_events
from public;

revoke all on table public.clock_risk_events
from anon;

revoke all on table public.clock_risk_events
from authenticated;


-- Libera apenas as operações necessárias.
-- RLS continuará decidindo quais registros podem ser acessados.

grant select, insert, update, delete
on table public.clock_risk_events
to authenticated;


-- ============================================================
-- 6. POLICY DE LEITURA
-- ============================================================

create policy clock_risk_tenant_read
on public.clock_risk_events
for select
to authenticated
using (

  tenant_id = public.current_tenant_id()

  and (

    public.is_tenant_admin_member(tenant_id)

    or

    public.has_tenant_role(
      tenant_id,
      array['auditor']
    )

  )
);


-- ============================================================
-- 7. POLICY DE ESCRITA
-- ============================================================

create policy clock_risk_tenant_write
on public.clock_risk_events
for all
to authenticated

using (

  tenant_id = public.current_tenant_id()

  and

  public.is_tenant_admin_member(tenant_id)

)

with check (

  tenant_id = public.current_tenant_id()

  and

  public.is_tenant_admin_member(tenant_id)

);


-- ============================================================
-- 8. TRIGGER DE CONSISTÊNCIA TENANT/FILIAL
-- ============================================================

drop trigger if exists trg_clock_risk_events_tenant_branch
on public.clock_risk_events;


create trigger trg_clock_risk_events_tenant_branch

before insert
or update of tenant_id, branch_id

on public.clock_risk_events

for each row

execute function public.enforce_tenant_relation(
  'branches',
  'branch_id'
);


-- ============================================================
-- 9. ÍNDICES
-- ============================================================

create index if not exists idx_authorized_devices_review_v53
on public.authorized_devices (
  tenant_id,
  status,
  last_used_at desc
);


create index if not exists idx_clock_risk_queue_v53
on public.clock_risk_events (
  tenant_id,
  resolution_status,
  risk_level,
  created_at desc
);


create index if not exists idx_clock_risk_employee_v53
on public.clock_risk_events (
  tenant_id,
  employee_id,
  created_at desc
);


create index if not exists idx_clock_risk_branch_v53
on public.clock_risk_events (
  tenant_id,
  branch_id,
  created_at desc
);


-- ============================================================
-- 10. DOCUMENTAÇÃO
-- ============================================================

comment on table public.clock_risk_events is
'Sinais explicáveis de risco do ponto. O score nunca invalida automaticamente o registro; encaminha para revisão.';


-- ============================================================
-- 11. VALIDAÇÃO FINAL
-- ============================================================

do $$
begin

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'clock_risk_events'
  ) then

    raise exception
      'Falha: clock_risk_events não foi criada.';

  end if;

  raise notice
    'NexPonto v5.3: clock_risk_events configurada com sucesso.';

end
$$;