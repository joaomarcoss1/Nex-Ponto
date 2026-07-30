-- NexPonto v5.2 — decisão explícita de jornada e efeito financeiro de ausências.

alter table public.absence_justifications
  add column if not exists absence_type text not null default 'full_absence',
  add column if not exists workflow_status text not null default 'pending',
  add column if not exists effect_on_journey text not null default 'pending',
  add column if not exists financial_effect text not null default 'pending',
  add column if not exists absence_minutes integer,
  add column if not exists decision_reason text,
  add column if not exists decision_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists attachment_sha256 text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_scan_status text not null default 'not_required';

do $$ begin
  alter table public.absence_justifications add constraint absence_type_v52
    check(absence_type in ('full_absence','late','early_leave','extended_break','partial_absence','vacation','leave','medical_leave','suspension')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.absence_justifications add constraint absence_attachment_scan_status_v52
    check(attachment_scan_status in ('not_required','pending','clean','rejected','error')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.absence_justifications add constraint absence_financial_effect_v52
    check(financial_effect in ('pending','deductible','non_deductible','paid_leave')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.absence_justifications add constraint absence_minutes_positive_v52
    check(absence_minutes is null or absence_minutes>0) not valid;
exception when duplicate_object then null; end $$;

update public.absence_justifications
set workflow_status=case status::text when 'approved' then 'approved' when 'rejected' then 'rejected' else 'pending' end,
    effect_on_journey=case status::text when 'approved' then 'excused' when 'rejected' then 'unexcused' else 'pending' end,
    financial_effect=case status::text when 'approved' then 'non_deductible' when 'rejected' then 'deductible' else 'pending' end
where workflow_status='pending' and financial_effect='pending';

create index if not exists idx_absence_effects_v52
  on public.absence_justifications(tenant_id,employee_id,absence_date,financial_effect);
