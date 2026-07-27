-- NexPonto v5.1 — relatórios profissionais, jobs e bloqueio de escrita no motor legado.

alter table public.report_exports
  add column if not exists idempotency_key text,
  add column if not exists checksum_sha256 text,
  add column if not exists row_count integer,
  add column if not exists progress integer not null default 0 check(progress between 0 and 100),
  add column if not exists download_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz;
create unique index if not exists uq_report_exports_tenant_idempotency_v51 on public.report_exports(tenant_id,idempotency_key) where idempotency_key is not null;

create table if not exists public.legacy_payroll_write_blocks (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  blocked boolean not null default true,
  reason text not null default 'Motor profissional v5.1 é a fonte única para novas gerações.',
  enabled_at timestamptz not null default now(),
  enabled_by uuid references auth.users(id) on delete set null
);
insert into public.legacy_payroll_write_blocks(tenant_id)
select id from public.tenants on conflict(tenant_id) do nothing;

create or replace function public.assert_legacy_payroll_write_allowed_v51(p_tenant_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.legacy_payroll_write_blocks where tenant_id=p_tenant_id and blocked) then
    raise exception 'LEGACY_PAYROLL_READ_ONLY';
  end if;
end $$;

create or replace function public.queue_report_export_v51(
  p_tenant_id uuid,p_requested_by uuid,p_report_type text,p_format text,p_filters jsonb,p_idempotency_key text
)
returns public.report_exports
language plpgsql security definer set search_path=public as $$
declare row_value public.report_exports%rowtype;
begin
  if p_format not in ('pdf','xlsx','csv') then raise exception 'INVALID_REPORT_FORMAT'; end if;
  select * into row_value from public.report_exports where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then return row_value; end if;
  insert into public.report_exports(tenant_id,requested_by,report_type,format,filters,status,idempotency_key,progress)
  values(p_tenant_id,p_requested_by,p_report_type,p_format,coalesce(p_filters,'{}'::jsonb),'queued',p_idempotency_key,0)
  returning * into row_value;
  return row_value;
end $$;
revoke all on function public.queue_report_export_v51(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.queue_report_export_v51(uuid,uuid,text,text,jsonb,text) to service_role;
