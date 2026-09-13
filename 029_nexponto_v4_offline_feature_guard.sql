-- NexPonto v4 — mantém o ponto offline indisponível até homologação da fila local,
-- assinatura do dispositivo, sincronização idempotente e revisão de conflitos.

update public.subscription_plans
set features = jsonb_set(coalesce(features,'{}'::jsonb), '{offline}', 'false'::jsonb, true),
    updated_at = now()
where coalesce((features->>'offline')::boolean,false) is true;

insert into public.tenant_features(tenant_id,feature_key,enabled,configuration)
select
  id,
  'offline_clock',
  false,
  jsonb_build_object(
    'status','disabled_pending_homologation',
    'requires','indexeddb_signed_queue,device_authorization,idempotent_sync,clock_tamper_detection,conflict_review'
  )
from public.tenants
on conflict (tenant_id,feature_key) do update
set enabled=false,
    configuration=excluded.configuration,
    updated_at=now();

comment on table public.tenant_features is
'Flags operacionais por tenant. offline_clock permanece desabilitada até homologação técnica específica.';
