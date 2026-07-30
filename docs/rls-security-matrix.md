# Matriz RLS

## Principio

Todo acesso direto pelo Supabase deve respeitar tenant, membership ativa, empresa ativa, permissao canonica e filial quando houver `branch_id`.

## Tabelas criticas com escrita direta revogada em 053

`admin_users`, `tenant_memberships`, `employees`, `employee_salary_history`, `work_schedules`, `employee_branch_authorizations`, `time_entries`, `work_sessions`, `work_session_events`, `time_entry_adjustments`, `absence_justifications`, `overtime_reviews`, `hour_bank_movements`, `payroll_periods`, `payroll_items`, `payroll_calculation_runs`, `payroll_rubrics`, `payroll_item_rubrics`, `payroll_divergences`, `payroll_approvals`, `payroll_state_transitions`, `audit_logs`, `background_jobs`, `background_job_events`, `report_exports`, `privacy_requests`, `tenant_lifecycle_requests`, `tenant_subscriptions`.

## Padrao por dominio

| Dominio | Leitura | Escrita |
| --- | --- | --- |
| Funcionarios | `employee.view` ou papel legado equivalente + filial | servidor/RPC com `employee.manage` |
| Escalas | `schedule.view` + filial | servidor/RPC com `schedule.manage` |
| Ponto | `time_entry.view` + filial | RPC/servidor com idempotencia, PIN, QR/GPS e auditoria |
| Justificativas | `justification.view` + filial | servidor/RPC com `justification.review` |
| Banco de horas | `time_bank.view` + filial | ledger imutavel por RPC/servidor com `time_bank.manage` |
| Pre-folha | `payroll.view` + filial | RPC/servidor segregado por permissao especifica |
| Auditoria | `audit.view` | sem escrita direta de cliente |
| Jobs/exportacoes | `reports.export` | worker interno/service role |

## Casos obrigatorios de teste

Tenant A nao le, cria, altera, exclui, exporta nem baixa dados do tenant B. Gestor A1 nao acessa dados restritos a A2. Sessao Master exige escopo ativo e nao usa acesso sem razao/auditoria.

