do $$ begin
  create type public.overtime_review_status as enum ('pending', 'approved', 'rejected', 'adjusted');
exception when duplicate_object then null; end $$;

alter table public.overtime_reviews
  alter column status drop default;

alter table public.overtime_reviews
  alter column status type public.overtime_review_status
  using (
    case
      when status::text in ('pending', 'approved', 'rejected', 'adjusted') then status::text
      else 'pending'
    end
  )::public.overtime_review_status;

alter table public.overtime_reviews
  alter column status set default 'pending'::public.overtime_review_status;

alter table public.employee_salary_history
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists reason text;

update public.employee_salary_history
set valid_from = coalesce(valid_from, effective_from, created_at::date)
where valid_from is null;

create index if not exists idx_employee_salary_history_validity
  on public.employee_salary_history(employee_id, valid_from, valid_until);

create index if not exists idx_overtime_reviews_status_date
  on public.overtime_reviews(status, entry_date);

insert into public.system_settings (key, value) values
  ('allow_outside_radius_review', 'false'::jsonb),
  ('primary_color', '"#078d3a"'::jsonb),
  ('secondary_color', '"#ffc107"'::jsonb)
on conflict (key) do nothing;
