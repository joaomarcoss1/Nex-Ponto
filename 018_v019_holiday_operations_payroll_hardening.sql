-- NexPonto v019
-- Decisões operacionais de feriados, notificações idempotentes e endurecimento da folha.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'holiday_operation_status') then
    create type public.holiday_operation_status as enum ('pending', 'open', 'closed');
  end if;
end $$;

create table if not exists public.holiday_operation_decisions (
  id uuid primary key default gen_random_uuid(),
  holiday_id uuid not null references public.holidays(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  operation_status public.holiday_operation_status not null default 'pending',
  decided_by uuid references public.admin_users(id) on delete set null,
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_holiday_operation_decision_scope
  on public.holiday_operation_decisions(holiday_id, branch_id) nulls not distinct;
create index if not exists idx_holiday_operation_decisions_branch_status
  on public.holiday_operation_decisions(branch_id, operation_status, updated_at desc);
create index if not exists idx_holidays_active_date_v019
  on public.holidays(active, holiday_date, branch_id);


alter table public.employees
  add column if not exists termination_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_termination_after_admission'
  ) then
    alter table public.employees
      add constraint employees_termination_after_admission
      check (termination_date is null or termination_date >= admission_date);
  end if;
end $$;

alter table public.admin_notifications
  add column if not exists source_key text;
create unique index if not exists uq_admin_notifications_source_key
  on public.admin_notifications(source_key)
  where source_key is not null;

insert into public.system_settings(key, value)
values ('holiday_decision_notification_days', '7'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_v019_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists holiday_operation_decisions_updated_at on public.holiday_operation_decisions;
create trigger holiday_operation_decisions_updated_at
before update on public.holiday_operation_decisions
for each row execute function public.set_v019_updated_at();

alter table public.holiday_operation_decisions enable row level security;

drop policy if exists "v019 admins read holiday decisions" on public.holiday_operation_decisions;
create policy "v019 admins read holiday decisions"
on public.holiday_operation_decisions
for select to authenticated
using (public.is_admin());

drop policy if exists "v019 admins write holiday decisions" on public.holiday_operation_decisions;
create policy "v019 admins write holiday decisions"
on public.holiday_operation_decisions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Permite marcar notificações como lidas pelo próprio administrador.
drop policy if exists "v019 admins update own notifications" on public.admin_notifications;
create policy "v019 admins update own notifications"
on public.admin_notifications
for update to authenticated
using (
  public.is_admin()
  and (
    admin_user_id is null
    or admin_user_id = (select id from public.admin_users where auth_user_id = auth.uid() and active = true limit 1)
  )
)
with check (public.is_admin());

-- Cria decisões pendentes para feriados existentes. Para feriado global, a decisão global
-- serve como padrão e pode ser sobrescrita por uma decisão específica de filial.
insert into public.holiday_operation_decisions(holiday_id, branch_id, operation_status)
select h.id, h.branch_id, 'pending'::public.holiday_operation_status
from public.holidays h
where h.active = true and h.type = 'holiday'
on conflict do nothing;

analyze public.holiday_operation_decisions;
analyze public.holidays;
