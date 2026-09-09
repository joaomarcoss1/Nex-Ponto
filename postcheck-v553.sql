select case when
  not exists(select 1 from public.tenant_memberships tm join public.admin_users au on au.id=tm.admin_user_id where tm.admin_user_id is not null and (au.tenant_id is distinct from tm.tenant_id or au.auth_user_id is distinct from tm.auth_user_id))
  and not exists(select 1 from public.employees e join public.branches b on b.id=e.branch_id where e.tenant_id is distinct from b.tenant_id)
  and not exists(select 1 from public.hour_bank_movements where overtime_review_id is not null and origin='approved_overtime' group by tenant_id,overtime_review_id having count(*)>1)
  and to_regprocedure('public.heartbeat_background_job_v553(uuid,text)') is not null
  and to_regprocedure('public.complete_background_job_v553(uuid,text,jsonb)') is not null
then 'PASS' else 'FAIL' end as v553_postcheck;
