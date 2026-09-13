-- Salva filial e sete horários na mesma transação PostgreSQL.
create or replace function public.upsert_branch_with_hours_v54(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_branch jsonb,
  p_effective_from date,
  p_hours jsonb,
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare branch_row public.branches%rowtype;
begin
  if p_tenant_id is null or p_actor_user_id is null then raise exception 'TENANT_AND_ACTOR_REQUIRED'; end if;
  if p_branch_id is null then
    insert into public.branches(
      tenant_id,code,name,type,address,timezone,responsible_name,phone,latitude,longitude,
      allowed_radius_meters,google_maps_url,map_place_id,geofence_enabled,geolocation_configured_at,
      geolocation_status,gps_ready,geolocation_confirmed_at,geolocation_confirmed_by,active
    ) values(
      p_tenant_id,nullif(p_branch->>'code',''),p_branch->>'name',p_branch->>'type',p_branch->>'address',p_branch->>'timezone',
      nullif(p_branch->>'responsible_name',''),nullif(p_branch->>'phone',''),(p_branch->>'latitude')::numeric,
      (p_branch->>'longitude')::numeric,(p_branch->>'allowed_radius_meters')::integer,nullif(p_branch->>'google_maps_url',''),
      nullif(p_branch->>'map_place_id',''),coalesce((p_branch->>'geofence_enabled')::boolean,true),
      coalesce((p_branch->>'geolocation_configured_at')::timestamptz,now()),coalesce(p_branch->>'geolocation_status','pending'),
      coalesce((p_branch->>'gps_ready')::boolean,false),(p_branch->>'geolocation_confirmed_at')::timestamptz,
      (p_branch->>'geolocation_confirmed_by')::uuid,coalesce((p_branch->>'active')::boolean,true)
    ) returning * into branch_row;
  else
    update public.branches set
      code=nullif(p_branch->>'code',''),name=p_branch->>'name',type=p_branch->>'type',address=p_branch->>'address',
      timezone=p_branch->>'timezone',responsible_name=nullif(p_branch->>'responsible_name',''),phone=nullif(p_branch->>'phone',''),
      latitude=(p_branch->>'latitude')::numeric,longitude=(p_branch->>'longitude')::numeric,
      allowed_radius_meters=(p_branch->>'allowed_radius_meters')::integer,google_maps_url=nullif(p_branch->>'google_maps_url',''),
      map_place_id=nullif(p_branch->>'map_place_id',''),geofence_enabled=coalesce((p_branch->>'geofence_enabled')::boolean,true),
      geolocation_configured_at=coalesce((p_branch->>'geolocation_configured_at')::timestamptz,now()),
      geolocation_status=coalesce(p_branch->>'geolocation_status','pending'),gps_ready=coalesce((p_branch->>'gps_ready')::boolean,false),
      geolocation_confirmed_at=(p_branch->>'geolocation_confirmed_at')::timestamptz,
      geolocation_confirmed_by=(p_branch->>'geolocation_confirmed_by')::uuid,
      active=coalesce((p_branch->>'active')::boolean,true),updated_at=now()
    where id=p_branch_id and tenant_id=p_tenant_id returning * into branch_row;
    if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  end if;

  perform * from public.replace_branch_operating_hours_v4(
    p_tenant_id,branch_row.id,p_effective_from,p_hours,p_actor_user_id,p_membership_id,p_reason
  );
  return to_jsonb(branch_row);
end $$;
revoke all on function public.upsert_branch_with_hours_v54(uuid,uuid,jsonb,date,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.upsert_branch_with_hours_v54(uuid,uuid,jsonb,date,jsonb,uuid,uuid,text) to service_role;
