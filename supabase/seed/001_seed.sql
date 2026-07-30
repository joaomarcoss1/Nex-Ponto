-- NexPonto: seed seguro. Não cria empresas, filiais, funcionários ou credenciais.

insert into public.system_settings (key, value) values
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
