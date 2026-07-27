-- NexPonto: estrutura de jornada sem dados de clientes.
-- Esta migration substitui a antiga carga operacional que continha dados pessoais.

alter table public.employees
  add column if not exists expected_lunch_start_time time,
  add column if not exists expected_lunch_end_time time,
  add column if not exists schedule_confirmed boolean not null default false,
  add column if not exists profile_notes text;

alter table public.work_schedules
  add column if not exists expected_lunch_start_time time,
  add column if not exists expected_lunch_end_time time;

create unique index if not exists idx_employees_document_unique
  on public.employees(document)
  where document is not null and document <> '';

comment on column public.employees.schedule_confirmed is
  'Indica que a jornada contratual foi conferida. A escala publicada continua sendo a fonte efetiva.';
