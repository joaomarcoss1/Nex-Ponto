-- NexPonto v5.1 — ciclos, atribuições e cobertura operacional.

alter table public.schedule_cycles
  add column if not exists cycle_type text not null default 'custom' check(cycle_type in ('5x2','6x1','12x36','week_ab','rotating_sundays','custom')),
  add column if not exists description text,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_until date,
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists validation_policy text not null default 'block' check(validation_policy in ('block','justify','warn'));

create table if not exists public.employee_schedule_cycle_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  cycle_id uuid not null references public.schedule_cycles(id) on delete restrict,
  cycle_start_date date not null,
  effective_from date not null,
  effective_until date,
  status text not null default 'active' check(status in ('draft','active','superseded','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from)
);

alter table public.coverage_requirements
  add column if not exists publish_policy text not null default 'block' check(publish_policy in ('block','justify','warn')),
  add column if not exists requires_opening_responsible boolean not null default false,
  add column if not exists requires_closing_responsible boolean not null default false,
  add column if not exists maximum_people integer,
  add column if not exists notes text;

create table if not exists public.schedule_validation_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  work_date date,
  issue_code text not null,
  severity text not null check(severity in ('info','warning','blocking')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check(status in ('open','justified','resolved')),
  justification text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.validate_schedule_publication_v51(p_tenant_id uuid,p_publication_id uuid)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare pub public.schedule_publications%rowtype; issue_count integer:=0; blocking_count integer:=0; r record; actual integer;
begin
  select * into pub from public.schedule_publications where id=p_publication_id and tenant_id=p_tenant_id;
  if not found then raise exception 'PUBLICATION_NOT_FOUND'; end if;
  delete from public.schedule_validation_issues where tenant_id=p_tenant_id and publication_id=p_publication_id and status='open';

  -- Sobreposição do mesmo funcionário.
  for r in
    select a.employee_id,a.work_date,a.id as occurrence_id
    from public.schedule_occurrences a join public.schedule_occurrences b
      on b.tenant_id=a.tenant_id and b.employee_id=a.employee_id and b.id<>a.id and b.status in ('planned','published') and a.status in ('planned','published')
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
    where a.tenant_id=p_tenant_id and a.publication_id=p_publication_id and a.starts_at is not null
  loop
    insert into public.schedule_validation_issues(tenant_id,publication_id,branch_id,employee_id,work_date,issue_code,severity,message,details)
    values(p_tenant_id,p_publication_id,pub.branch_id,r.employee_id,r.work_date,'OVERLAPPING_SHIFT','blocking','Funcionário possui turnos sobrepostos.',jsonb_build_object('occurrence_id',r.occurrence_id));
    blocking_count:=blocking_count+1; issue_count:=issue_count+1;
  end loop;

  -- Cobertura mínima por requisito.
  for r in select * from public.coverage_requirements where tenant_id=p_tenant_id and branch_id=pub.branch_id and active and effective_from<=pub.period_end and (effective_until is null or effective_until>=pub.period_start)
  loop
    select count(distinct so.employee_id) into actual
      from public.schedule_occurrences so
      join public.employees e on e.id=so.employee_id and e.tenant_id=so.tenant_id
      join public.branches b on b.id=so.branch_id and b.tenant_id=so.tenant_id
      where so.tenant_id=p_tenant_id and so.publication_id=p_publication_id and so.is_day_off=false
        and (r.specific_date is null or so.work_date=r.specific_date)
        and (r.weekday is null or extract(dow from so.work_date)::integer=r.weekday)
        and (r.sector is null or e.sector=r.sector) and (r.role is null or e.role=r.role)
        and so.starts_at is not null and so.ends_at is not null
        and (so.starts_at at time zone coalesce(b.timezone,'America/Fortaleza'))::time < r.ends_at
        and (so.ends_at at time zone coalesce(b.timezone,'America/Fortaleza'))::time > r.starts_at;
    if actual<r.minimum_people then
      insert into public.schedule_validation_issues(tenant_id,publication_id,branch_id,work_date,issue_code,severity,message,details)
      values(p_tenant_id,p_publication_id,pub.branch_id,r.specific_date,'COVERAGE_DEFICIT',case when r.publish_policy='block' then 'blocking' else 'warning' end,'Cobertura mínima não atendida.',jsonb_build_object('required',r.minimum_people,'actual',actual,'sector',r.sector,'role',r.role,'starts_at',r.starts_at,'ends_at',r.ends_at));
      issue_count:=issue_count+1; if r.publish_policy='block' then blocking_count:=blocking_count+1; end if;
    end if;
  end loop;

  update public.schedule_publications set validation_summary=jsonb_build_object('issues',issue_count,'blocking',blocking_count,'validated_at',now()),status=case when blocking_count=0 and status='draft' then 'validated' else status end,updated_at=now() where id=p_publication_id;
  return jsonb_build_object('issues',issue_count,'blocking',blocking_count,'can_publish',blocking_count=0);
end $$;
revoke all on function public.validate_schedule_publication_v51(uuid,uuid) from public,anon,authenticated;
grant execute on function public.validate_schedule_publication_v51(uuid,uuid) to service_role;

create index if not exists idx_cycle_assignments_tenant_employee_effective_v51 on public.employee_schedule_cycle_assignments(tenant_id,employee_id,effective_from,effective_until,status);
create index if not exists idx_schedule_issues_publication_v51 on public.schedule_validation_issues(tenant_id,publication_id,severity,status);
