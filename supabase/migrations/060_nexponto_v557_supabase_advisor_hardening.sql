-- v5.5.7: correções apontadas pelos Advisors de segurança e performance do
-- Supabase, aplicadas primeiro ao vivo em produção (24/set/2026) e replicadas
-- aqui para que o histórico de migrations reflita o estado real do banco e
-- ambientes novos (CI, staging, clones) nasçam já corrigidos.

-- ---------------------------------------------------------------------------
-- 1. CRÍTICO: duas RPCs transacionais não validavam tenant/permissão do
--    chamador e, por uma divergência entre o que as migrations originais
--    declaravam (revoke de public + grant só para service_role) e o estado
--    real do banco, o papel `authenticated` tinha EXECUTE nelas — ou seja,
--    qualquer usuário autenticado de QUALQUER empresa podia chamar
--    `/rest/v1/rpc/replace_payroll_items_transactional` ou
--    `/rest/v1/rpc/review_shift_request_transactional` diretamente e
--    apagar/reescrever a folha ou aprovar solicitações de outra empresa,
--    contornando completamente as rotas Next.js e suas checagens de RBAC.
--    O aplicativo sempre chamou essas funções pela conexão service_role
--    (ver src/lib/server/tenant-scoped-client.ts), então revogar de
--    `authenticated` não tem nenhum efeito funcional — só fecha o buraco.
revoke execute on function public.replace_payroll_items_transactional(uuid, jsonb) from authenticated;
revoke execute on function public.review_shift_request_transactional(uuid, text, text, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. View com SECURITY DEFINER ignorando RLS da tabela employees por baixo do
--    pano. O filtro `can_access_branch` já existia, mas security_invoker=true
--    adiciona a RLS real de `employees` como uma segunda camada obrigatória,
--    em vez de confiar só no filtro da view.
alter view public.admin_employees_safe set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 3. Funções sem search_path fixo (vulneráveis a search_path hijacking).
alter function public.set_updated_at() set search_path = public;
alter function public.set_v019_updated_at() set search_path = public;
alter function public.hour_bank_signed_minutes_v51(text, integer) set search_path = public;

-- ---------------------------------------------------------------------------
-- 4. RLS reavaliando auth.uid()/is_platform_superadmin() por linha em vez de
--    uma vez por consulta (auth_rls_initplan). Mesmo efeito de acesso, mais
--    rápido em tabelas grandes.
drop policy if exists "platform_superadmins_self" on public.platform_superadmins;
create policy "platform_superadmins_self" on public.platform_superadmins for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists "memberships_self_read" on public.tenant_memberships;
create policy "memberships_self_read" on public.tenant_memberships for select to authenticated
  using ((auth_user_id = (select auth.uid())) or (select public.is_platform_superadmin()));

-- ---------------------------------------------------------------------------
-- 5. Índices duplicados (mesmas colunas, nomes diferentes vindos de
--    migrations sucessivas). Seis deles estavam só em time_entries, a tabela
--    mais escrita do sistema (toda batida de ponto mantinha 3 índices
--    redundantes a mais do que precisava).
drop index if exists public.idx_absence_justifications_status_branch;
drop index if exists public.idx_employee_salary_history_employee_validity_final;
drop index if exists public.idx_employees_branch_active;
drop index if exists public.idx_employees_branch_payment_active;
drop index if exists public.idx_employees_document;
drop index if exists public.idx_employees_registration_code;
drop index if exists public.idx_overtime_reviews_status_branch;
drop index if exists public.idx_payroll_items_period_employee;
drop index if exists public.idx_payroll_periods_branch_dates;
drop index if exists public.idx_time_entries_branch_date;
drop index if exists public.idx_time_entries_branch_date_v012;
drop index if exists public.idx_time_entries_branch_date_v018;
drop index if exists public.idx_time_entries_employee_date;
drop index if exists public.idx_time_entries_employee_date_v012;
drop index if exists public.idx_time_entries_date_action;

-- ---------------------------------------------------------------------------
-- 6. Chaves estrangeiras sem índice nas tabelas mais consultadas pelo
--    dashboard e pelos dois motores de folha (ver commit "perf: eliminate
--    O(employees x rows) re-scans" — sem estes índices, o agrupamento feito
--    em JS ainda esbarrava numa varredura completa no Postgres).
-- Aqui as instruções abaixo não usam a palavra-chave de criação concorrente:
-- em produção cada índice foi criado dessa forma manualmente, uma instrução
-- por vez, para não travar escritas; nesta migration, aplicada normalmente em
-- ambientes novos/CI com tabelas vazias, isso não é necessário.
create index if not exists idx_time_entries_work_session_id on public.time_entries(work_session_id);
create index if not exists idx_time_entries_device_id on public.time_entries(device_id);
create index if not exists idx_time_entries_original_entry_id on public.time_entries(original_entry_id);
create index if not exists idx_time_entries_qr_token_id on public.time_entries(qr_token_id);
create index if not exists idx_work_sessions_employee_id on public.work_sessions(employee_id);
create index if not exists idx_work_sessions_branch_id on public.work_sessions(branch_id);
create index if not exists idx_overtime_reviews_employee_id on public.overtime_reviews(employee_id);
create index if not exists idx_payroll_items_employee_id on public.payroll_items(employee_id);
create index if not exists idx_payroll_items_branch_id on public.payroll_items(branch_id);
create index if not exists idx_absence_justifications_employee_id on public.absence_justifications(employee_id);
create index if not exists idx_schedule_occurrences_employee_id on public.schedule_occurrences(employee_id);
create index if not exists idx_schedule_occurrences_branch_id on public.schedule_occurrences(branch_id);
create index if not exists idx_schedule_occurrences_shift_template_id on public.schedule_occurrences(shift_template_id);
create index if not exists idx_hour_bank_movements_created_by on public.hour_bank_movements(created_by);
create index if not exists idx_hour_bank_movements_overtime_review_id on public.hour_bank_movements(overtime_review_id);
create index if not exists idx_hour_bank_movements_payroll_item_id on public.hour_bank_movements(payroll_item_id);
create index if not exists idx_hour_bank_movements_request_id on public.hour_bank_movements(request_id);
create index if not exists idx_hour_bank_movements_reversal_of on public.hour_bank_movements(reversal_of);
create index if not exists idx_hour_bank_movements_source_movement_id on public.hour_bank_movements(source_movement_id);
create index if not exists idx_work_session_events_time_entry_id on public.work_session_events(time_entry_id);
create index if not exists idx_work_session_events_tenant_id on public.work_session_events(tenant_id);

comment on function public.replace_payroll_items_transactional(uuid, jsonb) is
  'v557: reafirma acesso restrito a service_role apenas — nunca reconceder EXECUTE a authenticated/anon (ver migration 060).';
comment on function public.review_shift_request_transactional(uuid, text, text, uuid) is
  'v557: reafirma acesso restrito a service_role apenas — nunca reconceder EXECUTE a authenticated/anon (ver migration 060).';
