-- NexPonto: preparação estrutural de geolocalização, sem unidades ou coordenadas reais.

alter table public.branches
  add column if not exists google_maps_url text,
  add column if not exists map_place_id text,
  add column if not exists geofence_enabled boolean not null default true,
  add column if not exists last_gps_test_at timestamptz,
  add column if not exists last_inside_radius_test_at timestamptz,
  add column if not exists last_outside_radius_test_at timestamptz;

insert into public.system_settings (key, value) values
  ('gps_diagnostic_enabled', 'true'::jsonb),
  ('default_radius_meters', '250'::jsonb)
on conflict (key) do nothing;
