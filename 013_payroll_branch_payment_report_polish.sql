-- v013 - Homologação operacional: filtros por unidade/dia de pagamento e exportações
-- Execute depois da migration 012.

alter table if exists public.employees
  add column if not exists payment_day integer;

alter table if exists public.payroll_periods
  add column if not exists payment_day integer;

alter table if exists public.employees
  drop constraint if exists employees_payment_day_check;

alter table if exists public.employees
  add constraint employees_payment_day_check
  check (payment_day is null or (payment_day between 1 and 31));

alter table if exists public.payroll_periods
  drop constraint if exists payroll_periods_payment_day_check;

alter table if exists public.payroll_periods
  add constraint payroll_periods_payment_day_check
  check (payment_day is null or (payment_day between 1 and 31));

comment on column public.employees.payment_day is 'Dia habitual de pagamento do colaborador. Usado para gerar folhas por matriz/filial e dia de pagamento.';
comment on column public.payroll_periods.payment_day is 'Dia de pagamento usado como filtro/snapshot da folha gerada.';

create index if not exists idx_employees_branch_payment_day_active
  on public.employees(branch_id, payment_day, active);

create index if not exists idx_payroll_periods_branch_payment_day
  on public.payroll_periods(branch_id, payment_day, start_date, end_date);

-- Normalização opcional para colaboradores já cadastrados: mantém nulo quando não houver certeza.
-- O RH deve preencher o dia de pagamento na tela de funcionários para filtros precisos.
