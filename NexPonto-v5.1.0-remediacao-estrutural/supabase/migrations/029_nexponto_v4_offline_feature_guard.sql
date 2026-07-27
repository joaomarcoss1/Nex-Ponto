-- NexPonto v4 — migration 029 corrigida
-- Mantém o ponto offline indisponível até homologação da fila local,
-- assinatura do dispositivo, sincronização idempotente e revisão de conflitos.
--
-- CORREÇÃO: a tabela public.tenant_features foi criada com a coluna `config`,
-- e não `configuration`. Esta versão padroniza o schema e usa `config`.
-- Migration idempotente e segura para reexecução.

-- -----------------------------------------------------------------------------
-- 1. Precheck
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.subscription_plans') is null then
    raise exception 'A tabela public.subscription_plans não existe. Execute primeiro as migrations anteriores.';
  end if;

  if to_regclass('public.tenant_features') is null then
    raise exception 'A tabela public.tenant_features não existe. Execute primeiro a migration de fundação multiempresa.';
  end if;

  if to_regclass('public.tenants') is null then
    raise exception 'A tabela public.tenants não existe.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Compatibilidade do schema de tenant_features
-- -----------------------------------------------------------------------------
-- O schema oficial do NexPonto usa `config`.
-- Se um ambiente antigo possuir apenas `configuration`, a coluna é renomeada.
-- Se não possuir nenhuma das duas, `config` é criada.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_features'
      and column_name = 'config'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tenant_features'
        and column_name = 'configuration'
    ) then
      execute 'alter table public.tenant_features rename column configuration to config';
    else
      execute 'alter table public.tenant_features add column config jsonb not null default ''{}''::jsonb';
    end if;
  end if;
end;
$$;

-- Garante default e NOT NULL da coluna oficial.
update public.tenant_features
set config = '{}'::jsonb
where config is null;

alter table public.tenant_features
  alter column config set default '{}'::jsonb,
  alter column config set not null;

-- -----------------------------------------------------------------------------
-- 3. Desabilita o recurso offline nos planos
-- -----------------------------------------------------------------------------
-- Evita cast direto que poderia falhar caso um JSON legado possua texto inválido.

update public.subscription_plans
set features = jsonb_set(
      coalesce(features, '{}'::jsonb),
      '{offline}',
      'false'::jsonb,
      true
    ),
    updated_at = now()
where lower(coalesce(features->>'offline', 'false')) in ('true', '1', 'yes', 'on');

-- -----------------------------------------------------------------------------
-- 4. Desabilita offline_clock para todos os tenants
-- -----------------------------------------------------------------------------

insert into public.tenant_features (
  tenant_id,
  feature_key,
  enabled,
  config
)
select
  t.id,
  'offline_clock',
  false,
  jsonb_build_object(
    'status', 'disabled_pending_homologation',
    'requires', jsonb_build_array(
      'indexeddb_signed_queue',
      'device_authorization',
      'idempotent_sync',
      'clock_tamper_detection',
      'conflict_review'
    )
  )
from public.tenants t
on conflict (tenant_id, feature_key) do update
set enabled = false,
    config = excluded.config,
    updated_at = now();

comment on table public.tenant_features is
'Flags operacionais por tenant. offline_clock permanece desabilitada até homologação técnica específica.';

comment on column public.tenant_features.config is
'Configuração JSON do recurso. Nome oficial da coluna no NexPonto: config.';

-- -----------------------------------------------------------------------------
-- 5. Postcheck
-- -----------------------------------------------------------------------------

do $$
declare
  enabled_count bigint;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_features'
      and column_name = 'config'
  ) then
    raise exception 'Falha: public.tenant_features.config não existe após a migration.';
  end if;

  select count(*)
    into enabled_count
  from public.tenant_features
  where feature_key = 'offline_clock'
    and enabled = true;

  if enabled_count > 0 then
    raise exception 'Falha: ainda existem % tenants com offline_clock habilitado.', enabled_count;
  end if;
end;
$$;
