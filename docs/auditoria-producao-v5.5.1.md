# Auditoria de Producao NexPonto v5.5.1

Data: 2026-08-16/17

## Classificacao

Status local do pacote: GO para homologacao tecnica.

Status producao real: NO-GO ate configurar Supabase real, aplicar migrations `001` a `056`, executar RLS multi-tenant, auditoria de grants, auditoria de banco e load test real de ponto.

## Correcoes aplicadas

| Prioridade | Problema | Arquivo | Correcao aplicada | Teste | Resultado |
| --- | --- | --- | --- | --- | --- |
| P0 | RPCs `SECURITY DEFINER` sensiveis expostas | `supabase/migrations/056_nexponto_v551_production_blockers.sql` | `REVOKE` de `PUBLIC/anon/authenticated` e `GRANT EXECUTE` para `service_role` | `structure:v551`; `audit:security-definer` criado | CORRIGIDO local; auditoria real BLOQUEADA sem Supabase |
| P0 | Desativar/reativar admin apagava permissoes | `056_nexponto_v551_production_blockers.sql` | Funcoes substituidas para alterar apenas `active`/timestamps | `structure:v551` | CORRIGIDO |
| P0 | Folha podia consultar colecoes grandes sem paginacao | `src/app/api/admin/payroll/professional/route.ts` | `fetchPayrollRows` em colecoes grandes | `typecheck`, `test`, `build` | CORRIGIDO local |
| P0 | Banco de horas historico carregava todo movimento | `056...sql`, `payroll/professional/route.ts` | RPC `hour_bank_summary_v551` e movimentos sinteticos equivalentes | `structure:v551`, `build` | CORRIGIDO local |
| P1 | Relatorios parcialmente paginados | `src/app/api/admin/reports/route.ts` | Paginacao por lote em faltas, funcionario, filial, almoco e tipos principais | `structure:v551`, `build` | CORRIGIDO local |
| P1 | Worker regulatorio podia exportar parcial | `src/app/api/internal/jobs/process/route.ts` | `fetchAllPaginated` em `time_entries` | `build` | CORRIGIDO local |
| P0 | Rate limit de device contornavel sem cookie | `src/app/api/public/device/route.ts` | Bucket pre-cookie `tenant + IP` e bucket pos-cookie | `structure:v551` | CORRIGIDO local |
| P0 | Anexos pendentes sem scanner real | `src/app/api/public/justifications/route.ts` | Upload bloqueado por padrao se `ATTACHMENT_SCANNER_ENABLED` nao for `true` | `structure:v551` | CORRIGIDO com protecao segura |
| P1 | Erros criticos apos RPC de ponto ignorados | `src/app/api/public/clock/register/route.ts` | Tratamento de erro em device, `time_entries.device_id` e `clock_risk_events` | `typecheck`, `build` | CORRIGIDO local |
| P1 | `requestId` podia mudar no mesmo request | `src/lib/server/http.ts` | `WeakMap<Request,string>` e `failForRequest` | `http.test.ts` | CORRIGIDO |
| P1 | Settings divergiam entre `system_settings` e `tenant_settings` | `src/lib/server/settings.ts`, `056...sql` | `tenant_settings` canonica para settings empresariais; fallback legado | `typecheck`, `build` | CORRIGIDO local |

## Resultado por blocos do prompt complementar

| Itens | Status | Observacao |
| --- | --- | --- |
| 4-8 SECURITY DEFINER, grants e actor | CORRIGIDO/BLOQUEADO | Grants implementados; auditoria real depende de Supabase |
| 9-12 Administradores | CORRIGIDO local | Permissoes preservadas; teste real de login/desativar/reativar depende de Supabase/Auth |
| 13-22 Folha profissional | CORRIGIDO local/BLOQUEADO | Paginacao e banco de horas agregado; dataset real >1.000 depende de Supabase |
| 23-29 Relatorios e jobs | CORRIGIDO parcial local | Paginacao e worker corrigidos; fluxo pesado assíncrono ja existe para regulatorio, nao para todos os relatorios administrativos |
| 30-34 Anexos | CORRIGIDO com bloqueio seguro | Upload bloqueado sem scanner; nao foi inventado `clean` automatico |
| 35-40 Rate limit/devices | CORRIGIDO local | Duas camadas de rate limit; limpeza de devices preservada em `cleanup_operational_data_v55` |
| 41-46 Settings | CORRIGIDO local/BLOQUEADO | Fonte canonica em `tenant_settings`; teste onboarding-runtime real depende de Supabase |
| 47-50 Request ID | CORRIGIDO | Teste unitario validou `x-request-id` |
| 51-65 Ponto e concorrencia | CORRIGIDO parcial/BLOQUEADO | Erros pos-RPC tratados e script real de carga criado; 70 registros simultaneos requer ambiente real |
| 66-77 Multitenancy/RLS/retencao | BLOQUEADO para validacao real | Scripts e migrations prontos; matriz RLS completa exige banco real |
| 78-85 E2E/testes de banco | BLOQUEADO parcial | E2E atual passou; fluxos reais admin/funcionario/folha exigem fixture Supabase/Auth |
| 86-90 Gates/load/relatorio | CORRIGIDO/BLOQUEADO | `structure:v551` e load script criados; load real nao executado sem fixture |

## Limites assumidos

Nao foi declarado PASS para:

- RLS 10 tenants;
- admin login real;
- folha com dataset real >1.000 no Supabase;
- relatorios reais >5.000 no Supabase;
- 70 pontos simultaneos contra banco real;
- corrida do mesmo funcionario;
- auditoria real de grants;
- storage cross-tenant;
- scanner de anexos.

Esses itens estao protegidos por scripts/gates e devem rodar em homologacao com `.env.local` real.
