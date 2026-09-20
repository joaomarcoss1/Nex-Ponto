-- NexPonto v5.3 - execução resiliente, privacidade e ciclo comercial.

alter table public.background_jobs
  add column if not exists worker_id text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz;

create table if not exists public.background_job_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_id uuid not null references public.background_jobs(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.background_job_events enable row level security;
revoke all on public.background_job_events from public,anon,authenticated;
create policy background_job_events_tenant_read on public.background_job_events
  for select to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));

create or replace function public.claim_background_job_v53(
  p_worker_id text,
  p_job_types text[]
)
returns setof public.background_jobs
language plpgsql security definer set search_path=public as $$
declare claimed public.background_jobs%rowtype;
begin
  select * into claimed
  from public.background_jobs
  where job_type=any(p_job_types)
    and (
      (status='queued' and run_after<=now())
      or (status='running' and lease_expires_at<now())
    )
    and attempts<max_attempts
  order by run_after,created_at
  for update skip locked
  limit 1;
  if not found then return; end if;
  update public.background_jobs
  set status='running',attempts=attempts+1,worker_id=p_worker_id,
      started_at=coalesce(started_at,now()),last_heartbeat_at=now(),
      lease_expires_at=now()+interval '5 minutes',updated_at=now()
  where id=claimed.id returning * into claimed;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(claimed.tenant_id,claimed.id,'claimed',jsonb_build_object('worker_id',p_worker_id,'attempt',claimed.attempts));
  return next claimed;
end $$;
revoke all on function public.claim_background_job_v53(text,text[])
  from public,anon,authenticated;
grant execute on function public.claim_background_job_v53(text,text[]) to service_role;

create or replace function public.fail_background_job_v53(
  p_job_id uuid,p_error_code text,p_error_message text
)
returns void language plpgsql security definer set search_path=public as $$
declare job public.background_jobs%rowtype;
begin
  select * into job from public.background_jobs where id=p_job_id for update;
  if not found then return; end if;
  update public.background_jobs
  set status=case when attempts>=max_attempts then 'dead_letter' else 'queued' end,
      error_code=p_error_code,error_message=left(p_error_message,2000),
      run_after=case when attempts>=max_attempts then run_after
                     else now()+make_interval(secs=>least(3600,power(2,attempts)::integer*30)) end,
      lease_expires_at=null,worker_id=null,updated_at=now()
  where id=p_job_id;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(job.tenant_id,job.id,
    case when job.attempts>=job.max_attempts then 'dead_letter' else 'retry_scheduled' end,
    jsonb_build_object('error_code',p_error_code,'attempt',job.attempts));
end $$;
revoke all on function public.fail_background_job_v53(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.fail_background_job_v53(uuid,text,text) to service_role;

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  requester_email text,
  request_type text not null check(request_type in ('access','portability','correction','deletion','opposition')),
  status text not null default 'received'
    check(status in ('received','identity_validation','in_progress','blocked_legal_retention','completed','rejected')),
  legal_basis text,
  retention_decision text,
  due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_type text not null check(request_type in ('activate','suspend','reactivate','cancel','export','purge')),
  status text not null default 'pending'
    check(status in ('pending','approved','processing','completed','rejected','failed')),
  reason text not null,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  scheduled_for timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.privacy_requests enable row level security;
alter table public.tenant_lifecycle_requests enable row level security;
revoke all on public.privacy_requests from public,anon,authenticated;
revoke all on public.tenant_lifecycle_requests from public,anon,authenticated;
create policy privacy_requests_tenant_read on public.privacy_requests
  for select to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
create policy tenant_lifecycle_superadmin_read on public.tenant_lifecycle_requests
  for select to authenticated using(public.is_platform_superadmin());

create index if not exists idx_jobs_claim_v53
  on public.background_jobs(status,run_after,job_type)
  where status in ('queued','running');
create index if not exists idx_privacy_requests_queue_v53
  on public.privacy_requests(tenant_id,status,due_at);

comment on function public.claim_background_job_v53 is
  'Reserva concorrente com SKIP LOCKED e lease, evitando execução duplicada.';
