-- NexPonto v4.0 — planejamento semanal, publicação versionada e cobertura.

alter table public.schedule_publications
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists notes text;

create unique index if not exists uq_shift_templates_tenant_code
  on public.shift_templates(tenant_id,lower(code)) where code is not null and code<>'';
create index if not exists idx_schedule_occurrences_tenant_employee_date_status
  on public.schedule_occurrences(tenant_id,employee_id,work_date,status);

create or replace function public.save_schedule_publication_v4(
  p_tenant_id uuid,
  p_publication_id uuid,
  p_branch_id uuid,
  p_period_start date,
  p_period_end date,
  p_occurrences jsonb,
  p_publish boolean,
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_notes text default null
)
returns public.schedule_publications
language plpgsql
security definer
set search_path=public
as $$
declare
  publication public.schedule_publications%rowtype;
  item jsonb;
  employee_row public.employees%rowtype;
  template_row public.shift_templates%rowtype;
  version_value integer;
  starts_value timestamptz;
  ends_value timestamptz;
  intervals_value jsonb;
  conflicts integer := 0;
  occurrence_count integer := 0;
begin
  if p_tenant_id is null or p_branch_id is null then raise exception 'SCHEDULE_SCOPE_REQUIRED'; end if;
  if p_period_start is null or p_period_end is null or p_period_end<p_period_start or p_period_end>p_period_start+45 then raise exception 'INVALID_SCHEDULE_PERIOD'; end if;
  if jsonb_typeof(p_occurrences)<>'array' then raise exception 'OCCURRENCES_ARRAY_REQUIRED'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and tenant_id=p_tenant_id and active) then raise exception 'BRANCH_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_periods where tenant_id=p_tenant_id and (branch_id is null or branch_id=p_branch_id) and status::text in ('closed','closed_with_exceptions','paid') and daterange(start_date,end_date,'[]') && daterange(p_period_start,p_period_end,'[]')) then
    raise exception 'CLOSED_PERIOD';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_branch_id::text||':'||p_period_start::text,0));

  if p_publication_id is not null then
    select * into publication from public.schedule_publications
    where id=p_publication_id and tenant_id=p_tenant_id and branch_id=p_branch_id for update;
    if not found then raise exception 'PUBLICATION_NOT_FOUND'; end if;
    if publication.status not in ('draft','validated') then raise exception 'PUBLICATION_IMMUTABLE'; end if;
    delete from public.schedule_occurrences where publication_id=publication.id and tenant_id=p_tenant_id;
  else
    select coalesce(max(version),0)+1 into version_value from public.schedule_publications
    where tenant_id=p_tenant_id and branch_id=p_branch_id and period_start=p_period_start and period_end=p_period_end;
    insert into public.schedule_publications(tenant_id,branch_id,period_start,period_end,version,status,created_by,notes)
    values(p_tenant_id,p_branch_id,p_period_start,p_period_end,version_value,'draft',p_actor_user_id,p_notes)
    returning * into publication;
  end if;

  for item in select value from jsonb_array_elements(p_occurrences)
  loop
    if (item->>'work_date')::date not between p_period_start and p_period_end then raise exception 'OCCURRENCE_OUTSIDE_PERIOD'; end if;
    select * into employee_row from public.employees
    where id=(item->>'employee_id')::uuid and tenant_id=p_tenant_id and active;
    if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
    if employee_row.branch_id<>p_branch_id and not exists(
      select 1 from public.employee_branch_authorizations a where a.tenant_id=p_tenant_id and a.employee_id=employee_row.id and a.branch_id=p_branch_id and a.active and (item->>'work_date')::date between a.starts_on and a.ends_on
    ) then raise exception 'EMPLOYEE_BRANCH_NOT_AUTHORIZED'; end if;

    starts_value := null;
    ends_value := null;
    intervals_value := coalesce(item->'intervals','[]'::jsonb);
    if coalesce((item->>'is_day_off')::boolean,false)=false then
      if item->>'shift_template_id' is null then raise exception 'SHIFT_TEMPLATE_REQUIRED'; end if;
      select * into template_row from public.shift_templates where id=(item->>'shift_template_id')::uuid and tenant_id=p_tenant_id and active;
      if not found then raise exception 'SHIFT_TEMPLATE_NOT_FOUND'; end if;
      starts_value := ((item->>'work_date')::date + template_row.starts_at) at time zone coalesce((select timezone from public.branches where id=p_branch_id),'America/Sao_Paulo');
      ends_value := ((item->>'work_date')::date + template_row.ends_at + case when template_row.crosses_midnight then interval '1 day' else interval '0' end) at time zone coalesce((select timezone from public.branches where id=p_branch_id),'America/Sao_Paulo');
      if ends_value<=starts_value then raise exception 'INVALID_SHIFT_TEMPLATE_RANGE'; end if;
      if jsonb_array_length(intervals_value)=0 then intervals_value:=coalesce(template_row.breaks,'[]'::jsonb); end if;
      if exists(
        select 1 from public.schedule_occurrences so
        join public.schedule_publications sp on sp.id=so.publication_id
        where so.tenant_id=p_tenant_id and so.employee_id=employee_row.id and so.status='published'
          and sp.status='published' and so.publication_id<>publication.id
          and tstzrange(so.starts_at,so.ends_at,'[)') && tstzrange(starts_value,ends_value,'[)')
      ) then conflicts:=conflicts+1; end if;
    end if;

    insert into public.schedule_occurrences(
      tenant_id,publication_id,employee_id,branch_id,work_date,shift_template_id,starts_at,ends_at,is_day_off,intervals,status
    ) values(
      p_tenant_id,publication.id,employee_row.id,p_branch_id,(item->>'work_date')::date,
      nullif(item->>'shift_template_id','')::uuid,starts_value,ends_value,coalesce((item->>'is_day_off')::boolean,false),intervals_value,
      case when p_publish then 'published' else 'planned' end
    );
    occurrence_count:=occurrence_count+1;
  end loop;

  if p_publish and conflicts>0 then raise exception 'SCHEDULE_CONFLICTS:%',conflicts; end if;

  if p_publish then
    update public.schedule_publications set status='superseded',updated_at=now()
    where tenant_id=p_tenant_id and branch_id=p_branch_id and id<>publication.id and status='published'
      and daterange(period_start,period_end,'[]') && daterange(p_period_start,p_period_end,'[]');
  end if;

  update public.schedule_publications
     set status=case when p_publish then 'published' else 'draft' end,
         published_at=case when p_publish then now() else null end,
         published_by=case when p_publish then p_actor_user_id else null end,
         notes=p_notes,
         validation_summary=jsonb_build_object('occurrences',occurrence_count,'conflicts',conflicts,'validated_at',now()),
         updated_at=now()
   where id=publication.id returning * into publication;

  insert into public.audit_logs(tenant_id,membership_id,user_email,action,entity,entity_id,reason,new_data)
  values(p_tenant_id,p_membership_id,coalesce((select email from auth.users where id=p_actor_user_id),'system'),
    case when p_publish then 'publish_schedule' else 'save_schedule_draft' end,'schedule_publications',publication.id::text,
    coalesce(p_notes,case when p_publish then 'Publicação de escala' else 'Rascunho de escala' end),publication.validation_summary);

  return publication;
end $$;
revoke all on function public.save_schedule_publication_v4(uuid,uuid,uuid,date,date,jsonb,boolean,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_schedule_publication_v4(uuid,uuid,uuid,date,date,jsonb,boolean,uuid,uuid,text) to service_role;

create or replace function public.upsert_shift_template_v4(
  p_tenant_id uuid,
  p_template_id uuid,
  p_branch_id uuid,
  p_name text,
  p_code text,
  p_role text,
  p_sector text,
  p_starts_at time,
  p_ends_at time,
  p_crosses_midnight boolean,
  p_expected_daily_minutes integer,
  p_color text,
  p_intervals jsonb,
  p_actor_user_id uuid
)
returns public.shift_templates
language plpgsql
security definer
set search_path=public
as $$
declare
  template public.shift_templates%rowtype;
  item jsonb;
  interval_total integer:=0;
  span_minutes integer;
begin
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if length(trim(coalesce(p_name,'')))<2 then raise exception 'TEMPLATE_NAME_REQUIRED'; end if;
  if p_starts_at is null or p_ends_at is null then raise exception 'TEMPLATE_TIME_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_intervals,'[]'::jsonb))<>'array' then raise exception 'INTERVALS_ARRAY_REQUIRED'; end if;
  for item in select value from jsonb_array_elements(coalesce(p_intervals,'[]'::jsonb)) loop
    if coalesce((item->>'paid')::boolean,false)=false then interval_total:=interval_total+coalesce((item->>'expected_minutes')::integer,0); end if;
  end loop;
  span_minutes:=extract(epoch from ((current_date+p_ends_at+case when p_crosses_midnight then interval '1 day' else interval '0' end)-(current_date+p_starts_at)))/60;
  if span_minutes<=0 then raise exception 'INVALID_TEMPLATE_RANGE'; end if;
  if p_expected_daily_minutes<>span_minutes-interval_total then raise exception 'TEMPLATE_MINUTES_MISMATCH'; end if;
  if p_template_id is null then
    insert into public.shift_templates(tenant_id,branch_id,name,code,role,sector,starts_at,ends_at,crosses_midnight,expected_daily_minutes,breaks,color,active,created_by)
    values(p_tenant_id,p_branch_id,trim(p_name),nullif(trim(coalesce(p_code,'')),''),nullif(trim(coalesce(p_role,'')),''),nullif(trim(coalesce(p_sector,'')),''),p_starts_at,p_ends_at,p_crosses_midnight,p_expected_daily_minutes,coalesce(p_intervals,'[]'::jsonb),coalesce(nullif(p_color,''),'#1268F3'),true,p_actor_user_id)
    returning * into template;
  else
    update public.shift_templates set branch_id=p_branch_id,name=trim(p_name),code=nullif(trim(coalesce(p_code,'')),''),role=nullif(trim(coalesce(p_role,'')),''),sector=nullif(trim(coalesce(p_sector,'')),''),starts_at=p_starts_at,ends_at=p_ends_at,crosses_midnight=p_crosses_midnight,expected_daily_minutes=p_expected_daily_minutes,breaks=coalesce(p_intervals,'[]'::jsonb),color=coalesce(nullif(p_color,''),'#1268F3'),updated_at=now()
    where id=p_template_id and tenant_id=p_tenant_id returning * into template;
    if not found then raise exception 'TEMPLATE_NOT_FOUND'; end if;
  end if;
  delete from public.shift_template_intervals where tenant_id=p_tenant_id and shift_template_id=template.id;
  for item in select value from jsonb_array_elements(coalesce(p_intervals,'[]'::jsonb)) loop
    insert into public.shift_template_intervals(tenant_id,shift_template_id,interval_type,sequence,planned_start,start_window_min,start_window_max,expected_minutes,minimum_minutes,maximum_minutes,paid,required,requires_clock,tolerance_minutes)
    values(p_tenant_id,template.id,coalesce(item->>'interval_type','meal'),coalesce((item->>'sequence')::integer,1),nullif(item->>'planned_start','')::time,nullif(item->>'start_window_min','')::time,nullif(item->>'start_window_max','')::time,coalesce((item->>'expected_minutes')::integer,0),coalesce((item->>'minimum_minutes')::integer,0),nullif(item->>'maximum_minutes','')::integer,coalesce((item->>'paid')::boolean,false),coalesce((item->>'required')::boolean,true),coalesce((item->>'requires_clock')::boolean,true),coalesce((item->>'tolerance_minutes')::integer,0));
  end loop;
  return template;
end $$;
revoke all on function public.upsert_shift_template_v4(uuid,uuid,uuid,text,text,text,text,time,time,boolean,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.upsert_shift_template_v4(uuid,uuid,uuid,text,text,text,text,time,time,boolean,integer,text,jsonb,uuid) to service_role;
