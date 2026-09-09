# Remediação final — NexPonto v5.5.3

Data: 18/08/2026  
Base: NexPonto v5.5.2  
Versão entregue: 5.5.3

## Veredito

**NÃO PRONTO PARA PRODUÇÃO neste ambiente local.**

Os P0/P1 estruturais conhecidos foram corrigidos no código e passaram nas validações locais. A promoção para produção permanece bloqueada até aplicar/testar a migration 056 em Supabase de homologação, executar login Master/Admin real, RLS A/B, concorrência real do ponto, fresh install/upgrade/re-run das migrations, Cron Vercel e readiness 200. O pacote falha fechado quando essas credenciais não existem; não declara PASS falso.

| Controle | Resultado local |
|---|---|
| P0 conhecido | 0 após remediação de código |
| P1 estrutural conhecido | 0 após remediação de código |
| Master login real | NOT RUN / ENV MISSING |
| Admin login real | NOT RUN / ENV MISSING |
| MFA | desativado e não exigido no código; E2E PASS |
| Multitenancy real A/B | NOT RUN / ENV MISSING |
| RBAC estático/automatizado | PASS — 37 rotas de escrita |
| Migrations estáticas | PASS — 56 sequenciais; idempotência estrutural 055+ |
| Clock concorrente real | NOT RUN / ENV MISSING |
| Payroll/relatórios unitários e volume simulado | PASS |
| Jobs — configuração e contratos | PASS local; execução Vercel real pendente |
| Build | PASS em Node 24 local; repetição em Node 22 obrigatória |
| Unit tests | PASS — 30 arquivos / 101 testes |
| E2E web/mobile | PASS — 12/12 |
| Dependências de produção | PASS — 0 vulnerabilidades no `npm audit` |
| Readiness real | NOT RUN / ENV MISSING |

## Matriz antes/depois

| Item | Antes | Depois | Evidência | Resultado |
|---|---|---|---|---|
| P0 mass assignment | `body.patch` aberto com service role | Zod `.strict()`, whitelist, lote máximo e 422 para campo desconhecido | `employee-bulk.test.ts` | PASS local |
| `tenant_id` | mutável em update genérico | bloqueado no adapter e por trigger de banco | `tenant-scoped-client.test.ts`, migration 056 | PASS local / DB pendente |
| Branch cross-tenant | role global aceitava UUID sem consulta | filial consultada no tenant, ativa e dentro do escopo | `assertBranchInTenant` | PASS local / IDOR real pendente |
| RBAC | escritas podiam usar `requireAdmin()` sem permissão | matriz por rota/método e fail-closed | `security:rbac` | PASS — 37 rotas |
| Folha editável por leitor | `payroll.view` permitia PATCH | exige `payroll.calculate` | rota `payroll-items` | PASS local |
| Revisão de ponto | sem requirement explícito | exige `time_entry.review` | rota `point-reviews` | PASS local |
| Auth/Admin/Membership | perfil resolvido por id+tenant | cruza também `auth_user_id`; FK composta | `auth.ts`, migration 056 | PASS local / DB pendente |
| Pré-folha >1000 | selects truncáveis e `.in()` gigante | paginação estável e IDs em lotes | `fetchAllRowsByValues` | PASS simulado 100k |
| Relatórios | `.limit(5001)` sujeito ao teto do PostgREST | paginação real, limite operacional explícito, `recordsProcessed` | rotas de relatórios | PASS local |
| Hora extra | chave aleatória podia duplicar crédito | crédito único por review; delta transacional em reaprovação | migration 056 | PASS estrutural / DB pendente |
| Jobs | endpoint sem executor comprovado | Vercel Cron, segredo, paginação, lease, heartbeat, completion/evento | `vercel.json`, migration 056 | PASS local / Vercel pendente |
| IP de PIN | IP em claro | `ip_hash` com salt obrigatório | `pin.ts`, migration 056 | PASS local |
| Scanner ausente | anexo ficava `pending` indefinidamente | `scanner_unavailable` quando desativado; estados explícitos | rota de justificativas, migration 056 | PASS local |
| Mobile | cobertura limitada | 360×800, 390×844, 430×932, tablet; tap target e modal seguro | Playwright | PASS 12/12 |
| MFA | schema legado podia sugerir exigência | migration 055 força `false`; sem AAL2/TOTP/challenge; URL legada redireciona | unit + E2E | PASS local |

## Principais arquivos

- `src/lib/validation/employee-bulk.ts`
- `src/lib/server/tenant-scoped-client.ts`
- `src/lib/server/branch-permissions.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/pagination.ts`
- `src/app/api/admin/employees/bulk/route.ts`
- `src/app/api/admin/payroll/professional/route.ts`
- `src/app/api/admin/reports/route.ts`
- `src/app/api/admin/reports/professional/route.ts`
- `src/app/api/admin/overtime-reviews/route.ts`
- `src/app/api/internal/jobs/process/route.ts`
- `src/lib/server/internal-job-auth.ts`
- `supabase/migrations/056_nexponto_v553_production_hardening.sql`
- `scripts/sql/precheck-v553.sql`
- `scripts/sql/precheck-master-admin.sql`
- `scripts/sql/postcheck-v553.sql`
- `vercel.json`

## Resultados executados

```text
npm ci                         PASS (Node 24 local; engine alert esperado)
npm run lint                   PASS — 0 erros
npm run typecheck              PASS — 0 erros
npm run test                   PASS — 30 arquivos / 101 testes
npm run build                  PASS — 58 páginas
npm run test:e2e:external      PASS — 12/12
npm run security:rbac          PASS — 37 rotas
npm run migrations:check       PASS — 56 migrations
npm audit --omit=dev           PASS — 0 vulnerabilidades
npm run test:integration:required  NOT RUN / ENV MISSING (exit 2)
npm run test:load:clock            NOT RUN / ENV MISSING (exit 2)
```

## Gate obrigatório de homologação

1. Executar `scripts/sql/precheck-v553.sql`; todos os contadores devem ser zero.
2. Aplicar migrations 001–056 em banco limpo.
3. Aplicar 056 sobre clone da v5.5.2; preservar contagens e checksums relevantes.
4. Reexecutar 056 e confirmar ausência de erro/duplicação.
5. Executar `scripts/sql/postcheck-v553.sql` e obter `PASS`.
6. Configurar as variáveis `TEST_*` e rodar `npm run test:integration:required`.
7. Rodar login Master/Admin com e-mail+senha, incluindo sessão/reload/timeout/500 e seletor de tenant.
8. Rodar o load test de ponto para 10 requests do mesmo funcionário e fixture de 70 funcionários.
9. Implantar `vercel.json`, configurar `CRON_SECRET` e comprovar claim/heartbeat/complete/fail/retry/dead-letter.
10. Confirmar `/api/readiness` = 200/`ready`, buckets privados, backups/PITR e restore testado.

Somente após os dez itens acima o veredito pode mudar para **PRONTO PARA PRODUÇÃO**.
