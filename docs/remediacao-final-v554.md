# NexPonto 5.5.4 — relatório final de remediação

Data: 19/08/2026  
Veredito: **NÃO PRONTO PARA PRODUÇÃO neste ambiente**  
Nota técnica local: **8,8/10**  
P0 de código reproduzível: **0**  
P1 de código reproduzível: **0**  
Bloqueadores externos de homologação: **4 P0** (login real, Tenant A/B/RLS, concorrência do ponto, readiness/infra) e **2 P1** (ciclo real de jobs e restauração de ensaio).

## Matriz

| Área | Status | Teste | Resultado |
|---|---|---|---|
| Arquitetura/build | PASS | Next.js build Node 22.19.0 | 58 páginas geradas |
| Auth/session | PASS local | contrato, testes e shell resiliente | 5xx/timeout não deslogam |
| Master | NOT RUN | login real exige credenciais | bloqueia produção |
| Admin | NOT RUN | login real exige credenciais | bloqueia produção |
| MFA | PASS | scan operacional + E2E da rota legada | desativado; login é e-mail/senha |
| RBAC | PASS | `security:rbac` | 37 rotas de escrita mapeadas |
| RLS/multitenancy | PASS estrutural / NOT RUN real | unitários, migration, integração obrigatória | credenciais Tenant A/B ausentes |
| Employee bulk | PASS local | Zod strict e testes | campos protegidos e conflito de PIN rejeitados |
| PIN | PASS estrutural / NOT RUN real | RPC 057 + teste de integração preparado | lote atômico; banco real pendente |
| Ponto/NSR/recibo | PASS estrutural / NOT RUN carga | unitários + script real de escrita | ambiente descartável ausente |
| Escalas | PASS local | unitários e build | consultas paginadas preservadas |
| Overtime/banco | PASS estrutural | migration 056/057 e testes | idempotência/reconciliação preservadas |
| Pré-folha | PASS local | 7 testes do motor profissional | folha oficial continua desativada |
| Relatórios | PASS local | 500, 1.500, 5.000, 10.001 e 100.000 linhas | sem truncamento em 5.000; teto explícito em 100.000 |
| Jobs | PASS estrutural / NOT RUN real | claim/fail/heartbeat/complete e migration | Cron/Supabase real pendentes |
| Storage | NOT RUN real | readiness/doctor | buckets reais não configurados |
| Environment | PASS contrato / NOT RUN real | doctor | `.env.local` ausente |
| PWA | PASS local | cache v5.5.4 e build | atualização versionada |
| Mobile/tablet/desktop | PASS público | Playwright Node 22 | 24/24 em 360–1440 px |
| UI/botões | PASS estático | `ux:audit` | 178 controles; sem link morto/handler vazio/dialog nativo |
| Segurança de dados | PASS | scanner e testes próprios | nomes de env aceitos; segredo real simulado bloqueado |
| Backup | PASS documental / NOT RUN ensaio | runbook criado | restauração real pendente |
| CI | PASS local / NOT RUN remoto | cadeia Node 22 | workflow atualizado; execução GitHub não disponível |
| Readiness | NOT RUN real | doctor recusou checks online | bloqueia produção |

## Correções implementadas

- `generatePins` e `patch.pin` são mutuamente exclusivos; geração de PIN ocorre separadamente de outros patches.
- `bulk_set_employee_pins_v554` valida tenant, bloqueia as linhas, atualiza e audita o lote na mesma transação. Nenhum PIN é retornado sem confirmação integral.
- scanner detecta JWT e chaves modernas Supabase por formato, sem confundir `process.env.SUPABASE_SERVICE_ROLE_KEY` com um valor secreto.
- relatório genérico usa paginação estável, timeout por página e até 100.000 linhas síncronas; acima disso retorna 413 orientado e nunca dados parciais.
- IP bruto foi retirado de `newData` dos exports; `writeAuditLog` gera somente `ip_hash`.
- jobs v5.5.4 vinculam falha ao worker, recuperam lease expirado, agendam retry e movem tentativas esgotadas para dead-letter.
- confirmações nativas foram substituídas por modais responsivos/acessíveis; botões canônicos bloqueiam em loading e informam `aria-busy`.
- `prefers-reduced-motion`, foco visível e matriz responsiva foram ampliados.
- migration 057, precheck, postcheck, doctor, readiness, CI, backup/restore e checklist de deploy foram atualizados.

## Validação executada em Node 22.19.0 / npm 10.9.2

- `npm ci`: PASS, 562 pacotes.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test`: PASS, 31 arquivos e 111 testes.
- `npm run security:data`: PASS.
- `npm run security:rbac`: PASS.
- `npm run ux:audit`: PASS.
- `npm run migrations:check`: PASS, 57 migrations.
- scripts estruturais v4/v5.1/v5.3/v5.4: PASS.
- `npm audit --omit=dev --audit-level=high`: PASS, zero vulnerabilidades.
- `npm run build`: PASS.
- Playwright: PASS, 24/24.
- `npm run test:integration:required`: **NOT RUN / ENV MISSING**.
- `npm run test:load:clock`: **NOT RUN / ENV MISSING**.

## Dependências externas antes do go-live

Aplicar a migration 057 em homologação; fornecer credenciais `TEST_*`; confirmar buckets privados e Vercel Cron; executar login Master/Admin, RLS A/B, PIN real, carga concorrente, ciclo dos jobs, readiness e restauração de ensaio. Até todos esses resultados serem PASS, não publicar como produção.
