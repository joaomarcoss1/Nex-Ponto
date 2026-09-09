-- NexPonto: migration intencionalmente sem carga de funcionários, filiais ou credenciais.
-- Mantida como marco de compatibilidade para instalações derivadas da versão anterior.

insert into public.system_settings (key, value)
values ('distribution_data_sanitized', 'true'::jsonb)
on conflict (key) do update
set value = excluded.value;
