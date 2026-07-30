-- NexPonto v5.2 — consolidação não destrutiva de branding e acesso de suporte.

insert into public.tenant_branding(
  tenant_id, app_name, short_name, tagline, primary_color, secondary_color,
  accent_color, background_color, surface_color, updated_at
)
select
  t.id, 'NexPonto', 'NexPonto', 'Gestão inteligente de jornadas',
  '#1268F3', '#F4B51C', '#22A5F5', '#F5F7FB', '#FFFFFF', now()
from public.tenants t
where not exists(select 1 from public.tenant_branding b where b.tenant_id=t.id);

-- Somente os padrões verdes históricos conhecidos são substituídos. Cores
-- customizadas por clientes são preservadas.
update public.tenant_branding
set primary_color='#1268F3', updated_at=now(), version=version+1
where lower(primary_color) in ('#078d3a','#078d3b','#008d3a');

-- Assets antigos migram apenas quando a fonte canônica ainda está vazia.
update public.tenant_branding b
set
  logo_url=coalesce(b.logo_url, nullif(trim(both '"' from logo.value::text),'')),
  mark_url=coalesce(b.mark_url, nullif(trim(both '"' from mark.value::text),'')),
  updated_at=now()
from public.tenants t
left join public.system_settings logo on logo.tenant_id=t.id and logo.key='logo_url'
left join public.system_settings mark on mark.tenant_id=t.id and mark.key='mark_url'
where b.tenant_id=t.id and (b.logo_url is null or b.mark_url is null);

alter table public.support_access_sessions
  add column if not exists scope text[] not null default array['support']::text[],
  add column if not exists represented_user_id uuid references auth.users(id) on delete set null,
  add column if not exists request_id text,
  add column if not exists ip_hash text,
  add column if not exists user_agent text;

alter table public.audit_logs
  add column if not exists support_session_id uuid references public.support_access_sessions(id) on delete set null;

create index if not exists idx_support_access_active_v52
  on public.support_access_sessions(platform_superadmin_id,status,expires_at);
create index if not exists idx_audit_support_session_v52
  on public.audit_logs(tenant_id,support_session_id,created_at desc);

update public.support_access_sessions
set status='expired', ended_at=coalesce(ended_at,expires_at)
where status='active' and expires_at<=now();

