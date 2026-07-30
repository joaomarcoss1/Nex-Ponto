# Matriz de autorização

| Papel | Escopo principal |
|---|---|
| `platform_superadmin` | plataforma; tenant somente por sessão de suporte |
| `tenant_owner` | todas as permissões do próprio tenant |
| `tenant_admin` | administração integral do tenant |
| `hr_manager` | pessoas, escalas, ponto, extras, banco e pré-folha |
| `payroll_manager` | pré-folha, aprovação, fechamento, extras e banco |
| `branch_manager` | equipe, escala e ponto das filiais autorizadas |
| `auditor` | leitura financeira, relatórios e auditoria |
| `employee` | portal pessoal |

Permissões canônicas: `tenant.manage`, `branch.manage`, `employee.manage`,
`schedule.manage`, `time_entry.review`, `overtime.review`, `time_bank.manage`,
`payroll.view`, `payroll.calculate`, `payroll.resolve_divergence`,
`payroll.hr_approve`, `payroll.financial_approve`, `payroll.close`,
`payroll.export`, `payroll.reopen`, `payroll.mark_paid`, `reports.export`,
`audit.view`, `branding.manage`, `administrators.manage`, `financial.view`.

`payroll.approve` é mantida apenas para compatibilidade legada e não autoriza as
novas transições. `payroll.mark_paid` permanece indisponível enquanto a folha
oficial estiver desativada.

Papéis legados são adaptados em `lib/security/authorization.ts`. Novas APIs devem declarar permissões, não nomes de papéis.
