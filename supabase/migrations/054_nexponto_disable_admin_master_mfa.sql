-- NexPonto v5.3.2
-- Desativa a exigência de MFA para administração e plataforma Master.

begin;

alter table public.platform_superadmins
  alter column mfa_required set default false;

update public.platform_superadmins
set mfa_required = false,
    updated_at = now()
where mfa_required is distinct from false;

create or replace function public.force_platform_mfa_disabled_v54()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.mfa_required := false;
  return new;
end;
$$;

drop trigger if exists trg_force_platform_mfa_disabled_v54
on public.platform_superadmins;

create trigger trg_force_platform_mfa_disabled_v54
before insert or update of mfa_required
on public.platform_superadmins
for each row
execute function public.force_platform_mfa_disabled_v54();

revoke all
on function public.force_platform_mfa_disabled_v54()
from public, anon, authenticated;

commit;