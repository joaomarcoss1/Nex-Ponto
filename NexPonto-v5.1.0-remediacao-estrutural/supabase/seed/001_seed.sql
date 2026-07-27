-- NexPonto — seed seguro corrigido para schema multiempresa
-- Não cria empresas, filiais, funcionários ou credenciais.
--
-- CORREÇÃO PRINCIPAL:
-- Após a migration 021, public.system_settings possui chave primária composta
-- (tenant_id, key). Portanto, ON CONFLICT (key) é inválido e o seed também precisa
-- informar tenant_id.
--
-- Este arquivo é compatível com:
-- 1. schema multiempresa: insere os defaults para cada tenant existente;
-- 2. schema legado: usa a chave antiga `key`, caso tenant_id ainda não exista.
--
-- Os valores existentes não são sobrescritos.

-- -----------------------------------------------------------------------------
-- 1. Precheck
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.system_settings') is null then
    raise exception 'A tabela public.system_settings não existe. Execute primeiro as migrations.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Seed compatível com schema multiempresa e legado
-- -----------------------------------------------------------------------------

do $$
declare
  has_tenant_id boolean;
  has_tenants_table boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'tenant_id'
  ) into has_tenant_id;

  select to_regclass('public.tenants') is not null
    into has_tenants_table;

  if has_tenant_id then
    if not has_tenants_table then
      raise exception 'system_settings possui tenant_id, mas public.tenants não existe. O schema multiempresa está incompleto.';
    end if;

    -- Insere os defaults para todos os tenants existentes sem alterar configurações já definidas.
    insert into public.system_settings (
      tenant_id,
      key,
      value
    )
    select
      t.id,
      defaults.key,
      defaults.value
    from public.tenants t
    cross join (
      values
        ('app_name', '"NexPonto"'::jsonb),
        ('app_short_name', '"NexPonto"'::jsonb),
        ('company_name', '""'::jsonb),
        ('company_document', '""'::jsonb),
        ('company_address', '""'::jsonb),
        ('primary_color', '"#1268F3"'::jsonb),
        ('secondary_color', '"#F4B51C"'::jsonb),
        ('accent_color', '"#22A5F5"'::jsonb),
        ('surface_color', '"#FFFFFF"'::jsonb),
        ('background_color', '"#F5F7FB"'::jsonb),
        ('late_tolerance_minutes', '10'::jsonb),
        ('early_leave_tolerance_minutes', '10'::jsonb),
        ('lunch_tolerance_minutes', '10'::jsonb),
        ('default_radius_meters', '250'::jsonb),
        ('max_gps_accuracy_meters', '80'::jsonb),
        ('overtime_multiplier', '1.5'::jsonb),
        ('daily_rate_calculation', '"expected_work_days"'::jsonb),
        ('report_footer', '"Documento gerado pelo NexPonto"'::jsonb)
    ) as defaults(key, value)
    on conflict (tenant_id, key) do nothing;

    raise notice 'Seed multiempresa aplicado para % tenant(s).', (select count(*) from public.tenants);
  else
    -- Compatibilidade somente para instalações antigas, anteriores à fundação multiempresa.
    insert into public.system_settings (key, value)
    values
      ('app_name', '"NexPonto"'::jsonb),
      ('app_short_name', '"NexPonto"'::jsonb),
      ('company_name', '""'::jsonb),
      ('company_document', '""'::jsonb),
      ('company_address', '""'::jsonb),
      ('primary_color', '"#1268F3"'::jsonb),
      ('secondary_color', '"#F4B51C"'::jsonb),
      ('accent_color', '"#22A5F5"'::jsonb),
      ('surface_color', '"#FFFFFF"'::jsonb),
      ('background_color', '"#F5F7FB"'::jsonb),
      ('late_tolerance_minutes', '10'::jsonb),
      ('early_leave_tolerance_minutes', '10'::jsonb),
      ('lunch_tolerance_minutes', '10'::jsonb),
      ('default_radius_meters', '250'::jsonb),
      ('max_gps_accuracy_meters', '80'::jsonb),
      ('overtime_multiplier', '1.5'::jsonb),
      ('daily_rate_calculation', '"expected_work_days"'::jsonb),
      ('report_footer', '"Documento gerado pelo NexPonto"'::jsonb)
    on conflict (key) do nothing;

    raise notice 'Seed aplicado no schema legado sem tenant_id.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Postcheck
-- -----------------------------------------------------------------------------

do $$
declare
  has_tenant_id boolean;
  missing_count bigint;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'system_settings'
      and column_name = 'tenant_id'
  ) into has_tenant_id;

  if has_tenant_id then
    select count(*)
      into missing_count
    from public.tenants t
    cross join (
      values
        ('app_name'),
        ('app_short_name'),
        ('primary_color'),
        ('secondary_color'),
        ('accent_color'),
        ('surface_color'),
        ('background_color'),
        ('late_tolerance_minutes'),
        ('early_leave_tolerance_minutes'),
        ('lunch_tolerance_minutes'),
        ('default_radius_meters'),
        ('max_gps_accuracy_meters'),
        ('overtime_multiplier'),
        ('daily_rate_calculation'),
        ('report_footer')
    ) required(key)
    left join public.system_settings s
      on s.tenant_id = t.id
     and s.key = required.key
    where s.key is null;

    if missing_count > 0 then
      raise exception 'Falha no seed: ainda faltam % configurações obrigatórias entre os tenants existentes.', missing_count;
    end if;
  else
    if not exists (
      select 1
      from public.system_settings
      where key = 'app_name'
    ) then
      raise exception 'Falha no seed legado: app_name não foi inserido.';
    end if;
  end if;
end;
$$;
