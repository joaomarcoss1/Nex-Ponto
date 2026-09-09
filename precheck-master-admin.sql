-- Substitua o parâmetro no cliente SQL sem registrar e-mail/senha em arquivo.
-- Requer execução com acesso a auth.users.
select
  u.id as auth_user_id,
  au.id as admin_user_id,
  tm.id as membership_id,
  tm.tenant_id,
  t.status as tenant_status,
  au.active as admin_active,
  tm.active as membership_active,
  (u.id=au.auth_user_id and u.id=tm.auth_user_id and au.id=tm.admin_user_id and au.tenant_id=tm.tenant_id) as identity_consistent
from auth.users u
join public.admin_users au on au.auth_user_id=u.id
join public.tenant_memberships tm on tm.auth_user_id=u.id and tm.admin_user_id=au.id and tm.tenant_id=au.tenant_id
join public.tenants t on t.id=tm.tenant_id
where lower(u.email)=lower(current_setting('app.master_admin_email',true));
