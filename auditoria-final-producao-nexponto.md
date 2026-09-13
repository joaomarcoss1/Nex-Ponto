# Auditoria Final NexPonto

Data: 2026-08-18  
Escopo: código-fonte NexPonto v5.5.2 pós-remediação  
Método: inventário, leitura estática, análise de SQL/RLS, execução dos verificadores disponíveis e tentativa de executar a cadeia completa. Nenhum código de aplicação ou migration foi alterado.

## 1. Resumo executivo

**Veredito: C — NÃO PRONTO PARA PRODUÇÃO. Nota geral: 5,2/10. P0: 1. P1: 7.**

O pacote possui boas fundações: ponto transacional, NSR atômico, recibo por trigger, chave idempotente, escopo de tenant no cliente server-side, funções `SECURITY DEFINER` com `search_path`, rate limit distribuído, PIN com bcrypt, readiness discriminado e cache PWA conservador. Porém, a edição em massa de funcionários aceita mass assignment com service role e permite alterar `tenant_id`; combinada com a validação de filial que considera qualquer UUID acessível para perfis de escopo global, isso permite injetar/mover um funcionário para outro tenant se os UUIDs forem conhecidos. É um P0 de integridade multitenant.

Também há P1 em RBAC de escrita, paginação da pré-folha profissional, relatórios/jobs, dupla aprovação de hora extra, execução real dos jobs e coerência Master/membership. Login real, RLS A/B, migrations aplicadas, concorrência e Vercel não puderam ser comprovados sem ambiente Supabase/Vercel.

## 2. Versão analisada

Versão coerente em `package.json`, `package-lock.json`, README, changelog, workflow e cache do service worker: **5.5.2**. Runtime declarado: Node 22 (`.nvmrc`; engine `>=22 <23`), npm 10.9.2. Ambiente da auditoria: Node 24.16.0. Stack: Next 15.5.21, React 19.1.0, TypeScript 5.9.2, Supabase JS 2.55.0, PostgreSQL/Supabase, PWA e Vercel serverless.

## 3. Arquitetura

```text
Frontend Next/React
  -> Supabase Auth (sessão persistente no navegador)
  -> APIs Next server-side
  -> requireAdmin / RBAC / branch scope
  -> tenant cookie assinado + tenant-scoped service client
  -> Supabase service role / RPC
  -> PostgreSQL + RLS + Storage
```

Inventário: 53 rotas admin, 17 públicas, 3 platform, 2 internas, 1 auth, health e readiness; 55 migrations; aproximadamente 84 tabelas, 75 funções, 88 policies, 150 índices, 13 triggers e 2 views definidos no histórico SQL. Não existe `vercel.json`.

## 4. Autenticação

`AdminLogin.tsx` chama `/api/auth/admin-login`, que valida Zod, limita IP/conta com RPC distribuída, autentica por senha e devolve access/refresh token; o cliente persiste via `setSession`. `authenticatedUser()` valida o bearer com `auth.getUser()`. Não há challenge adicional no fluxo operacional.

Estruturalmente o desenho é adequado, mas LOGIN-01/02/05/06/09/10 não foram executados contra Auth real. Resultado: **NÃO VALIDADO**.

## 5. Master/Admin

O caminho esperado é Auth -> `tenant_memberships` ativo -> tenant ativo -> `admin_users` ativo -> permissões. Há aliases para `master_admin`, `admin_geral`, `admin`, `gerente_filial`, `rh_financeiro`, `rh_admin` e `finance_admin`.

**P1 — coerência não garantida por constraint composta.** `tenant_memberships.admin_user_id` é apenas FK para `admin_users.id`; não existe constraint que obrigue simultaneamente `tenant_id` e `auth_user_id` iguais. Em `auth.ts`, quando `admin_user_id` existe, o perfil é buscado por `id + tenant_id`, sem confirmar `profile.auth_user_id = usuário autenticado`. A reconciliação 055 corrige dados quando executada, mas não impede regressão. Impacto: perfil/filiais/flag financeira errados se o vínculo ficar inconsistente.

## 6. MFA

Ocorrências operacionais: nenhuma chamada `auth.mfa`, AAL2, TOTP ou WebAuthn em Login, Shell, auth server, platform ou suporte. A rota legada `/admin/seguranca-mfa` apenas redireciona para `/admin`. A migration 055 altera `mfa_required` para `false`; ocorrências restantes são schema histórico, testes e verificadores.

**Estruturalmente desativado. Resultado operacional: NÃO VALIDADO**, porque não foi possível testar Master/Admin/platform com fator TOTP antigo cadastrado.

## 7. Sessão

`persistSession=true` e `autoRefreshToken=true`. `AdminShell` redireciona para login apenas quando não existe sessão ou a API devolve 401 classificado como sessão inválida. Timeout, 429, 500, 503, banco e ambiente produzem estado temporário, preservando a sessão. Não há `signOut()` automático em 5xx. Testes unitários cobrem o classificador, mas reload/refresh real não foi executado.

## 8. RBAC

Existem 22 permissões e aliases canônicos. Há bom controle em overtime, hora-banco, payroll profissional e suporte. Entretanto:

- **P1:** `PATCH /api/admin/payroll-items` aceita `payroll.view` **ou** `payroll.calculate`, permitindo que permissão de leitura altere valores financeiros.
- **P1 (mesmo achado de cobertura RBAC):** employee bulk e point-reviews chamam `requireAdmin()` sem exigir `employee.manage`/`time_entry.review`.
- `tenant_admin` e `admin_geral` recebem todas as permissões, inclusive fechamento/pagamento, decisão que precisa ser formalmente aceita pelo negócio.

## 9. RLS

| Tabela/grupo | RLS/policy no SQL | Tenant filter | Escrita direta | Resultado |
|---|---|---|---|---|
| employees, branches, time_entries, work_schedules | Sim | `current_tenant_id` + branch | authenticated/admin | Estrutural PASS; banco NÃO VALIDADO |
| work_sessions/events, clock_attempts | Sim, migrations 021/023 | tenant + branch/pai | admin/RPC | Estrutural PASS |
| tenant_memberships/admin_users | Sim | self/tenant/admin | restrita | Estrutural PASS com ressalva de integridade |
| payroll_* financeiros | Sim, hardening 035/042 | tenant + financial permission | escritas via service/RPC | Estrutural PASS |
| hour_bank/overtime/justifications | Sim | tenant + branch | admin/RPC | Estrutural PASS |
| audit/logins/reconciliation | Sim/revokes | service ou admin | restrita | Estrutural PASS |
| jobs/events/reports | Sim | tenant/admin | service | Estrutural PASS |
| Storage justificativas | Sim | primeiro segmento = tenant | permission check | Estrutural PASS; storage real NÃO VALIDADO |

Não houve conexão ao catálogo real; policies duplicadas, RLS efetivamente ativo e grants finais são **NÃO VALIDADOS**.

## 10. Multitenancy

### P0-01 — mass assignment permite escrita cruzada

- **Causa raiz:** `employees/bulk/route.ts:18-47` copia `body.patch` integralmente e executa `.update(patch)` com service role. `tenant-scoped-client.ts:141-143` filtra as linhas de origem por tenant, mas não impede alterar o valor de `tenant_id`. `canAccessBranch()` considera qualquer filial acessível para roles globais sem verificar que o UUID pertence ao tenant atual.
- **Impacto:** administrador do Tenant A pode mover/injetar funcionário em Tenant B ao enviar `patch: {tenant_id: B, branch_id: filialB, ...}`. O trigger relacional aceita se tenant e filial de destino coincidirem. Também é possível alterar colunas não autorizadas como `pin_hash`, datas e campos de controle.
- **Reprodução:** autenticar como tenant owner A; obter UUID público de filial B; PATCH `/api/admin/employees/bulk` com ID de funcionário A e patch acima; observar a linha sair de A e ingressar em B.
- **Correção recomendada:** schema Zod estrito e whitelist; proibir `tenant_id`, `id`, `pin_hash`, timestamps e chaves; validar filial por consulta tenant-scoped; fazer o proxy rejeitar mudança de `tenant_id` em updates; teste de IDOR A/B.
- **Risco da correção:** baixo/médio; pode quebrar clientes que enviam campos indevidos, o que é desejável.

Teste RLS A/B existente cobre apenas acesso direto anon/authenticated, não a API server-side service role. Resultado: **FAIL** para integridade de escrita multitenant.

## 11. Banco

Objetos críticos incluem tenants, memberships, admins, branches, employees, schedules/occurrences, time entries/sessions/receipts, payroll/rubrics/divergences/approvals, hour bank, overtime, justifications, audit, devices, jobs e reports. Índices críticos existem para tenant/idempotency, tenant/NSR, sessão aberta, job claim, payroll e consultas temporais. Consistência e cardinalidade reais, duplicidade Master e índices usados pelo planner não foram consultados.

## 12. Migrations

Há 55 arquivos sequenciais. O verificador passou para ordem, referência de funções e controles selecionados; a checagem genérica de idempotência é aplicada apenas à migration 055, portanto a mensagem “55 migrations ... idempotência” é mais ampla que o teste real. Nenhuma migration foi aplicada em PostgreSQL efêmero nesta auditoria.

| Faixa | Objetivo | Dependências | Idempotência estática | Resultado |
|---|---|---|---|---|
| 001–015 | schema inicial, GPS, folha, relatórios e homologações históricas | ordem estrita | parcial | NÃO VALIDADO em banco |
| 016–019 | RLS v017, feriados, plataforma/transações | schema anterior | policies verificadas em parte | PASS estático |
| 020–030 | multitenancy v3/v4, RLS, ponto, portal, escala, upserts e bootstrap | Auth + tabelas legadas | majoritariamente incremental | PASS estático |
| 031–044 | hora-banco, snapshots, pré-folha profissional, RLS financeiro, jobs, resultados e segregação | v4 | incremental, com DDL histórico | PASS estático |
| 045–052 | branding, overtime, faltas, idempotência, devices, NSR, jobs/LGPD | v5.1 | parcial | PASS estático |
| 053 | remediação v5.4, storage e auditor estrutural | has_permission/RLS | incremental | PASS estático |
| 054 | filial + horários atômicos | schema v4/v5 | incremental | PASS estático |
| 055 | MFA off, permission canônica, funcionário idempotente, reconcile, buckets | 020–054 | verificador específico PASS | PASS estático; aplicação NÃO VALIDADA |

`has_tenant_permission(uuid,text)` é canônica na 055; `_v54` delega para ela. `reconcile_admin_memberships_v55()` existe, tem grant somente service role, registra contadores e não promove além da role persistida; não é chamada automaticamente. Foram identificadas 65 funções `SECURITY DEFINER` finais pelo parser estático e todas possuem `search_path` explícito; grants finais permanecem NÃO VALIDADOS sem catálogo real.

## 13. Ponto

Fluxo: tenant -> funcionário/PIN -> rate limit -> filial/GPS/QR -> jornada -> tentativa -> RPC `register_time_entry_v4` -> time entry + session event + NSR/receipt por triggers -> audit. A RPC bloqueia funcionário, serializa eventos, usa índice de sessão aberta e transação PostgreSQL. NSR usa contador por tenant com upsert atômico e índice único `(tenant_id, nsr)`.

Ressalva: a checagem idempotente ocorre antes do lock do funcionário; duas requisições simultâneas iguais podem fazer a segunda receber 409 em vez de repetir o sucesso, embora a unicidade evite duplicação. Concorrência 10/70 e CLOCK-01..08 não foram executados. Resultado: **NÃO VALIDADO**.

## 14. Escalas

Publicação e ciclos têm RPCs transacionais, snapshots e paginação no `schedule-engine`. Porém `schedules/cycles` limita funcionários a 1000 e outras listas são não paginadas. Large tenant: FAIL/P1 de capacidade.

## 15. Banco de horas

Ledger imutável, minutos absolutos com sinal por tipo, advisory lock por tenant/funcionário, idempotência e estorno único. Boa estrutura; banco real e reprocessamento não testados. PASS COM RESSALVA.

## 16. Horas extras

### P1 — dupla aprovação pode duplicar crédito

`approve_overtime_v51` atualiza a revisão e acrescenta movimento de banco usando `p_idempotency_key + ':bank'`. A API gera UUID novo quando o cliente não fixa a chave; uma nova aprovação do mesmo review com chave diferente gera outro crédito e não estorna o anterior. Critério: bloquear transição repetida ou reconciliar diferencial por review com unicidade de destino.

## 17. Justificativas

Upload valida tipo/tamanho/hash, armazena por tenant e usa URL assinada. `attachment_scan_status` fica `pending` quando há anexo, mas não existe scanner/worker implementado; o sistema não declara o arquivo “clean”. Há N+1 de URLs assinadas por item. PASS COM RESSALVA.

## 18. Pré-folha

Flags previstas: `FEATURE_PRE_PAYROLL=true`, `FEATURE_OFFICIAL_PAYROLL=false`; o validador bloqueia folha oficial em produção. O motor legado principal passou a paginar até 100 mil linhas. Entretanto o motor profissional (`payroll/professional`) carrega employees, salários, contratos, overtime, hour bank, sessões, ocorrências, faltas e time entries sem `.range()`; o limite padrão Supabase pode truncar silenciosamente. **P1 — dataset incompleto e cálculo incorreto para tenant grande.**

## 19. Relatórios

PDF/XLSX são gerados em memória. O relatório genérico usa `.limit(5001)`, mas isso não garante superar o teto PostgREST do projeto; o teste `data.length >= 5001` pode nunca detectar truncamento em 1000. Relatório profissional também é não paginado. **P1 — exportações potencialmente incompletas.** Em volume, buffers síncronos podem exceder memória/timeout serverless.

## 20. Jobs

Fila tem `SKIP LOCKED`, lease, tentativas, backoff e dead letter. Não há `vercel.json`, cron ou worker implantável; só endpoints protegidos por segredo. O processador lê pontos sem paginação, não renova heartbeat e ignora o erro da atualização que marca `completed`. **P1 — execução real e completude não garantidas.**

## 21. Performance

Paginação real existe em payroll legado, overtime detection e schedule context. Persistem limites silenciosos em hour bank (1000), inconsistências (1000), ciclos (1000), shift requests (1000), relatórios e payroll profissional. Há N+1 em feriados, URLs de justificativas e geração de PIN em massa. Cenário 10.000/100.000/12 meses: FAIL conceitual.

## 22. Segurança

Pontos positivos: bcrypt custo 12, rate limit distribuído por hashes, CSP com nonce/strict-dynamic, headers, secrets server-only, logs sanitizados e tokens HMAC. PIN nunca é gravado em claro. Ressalvas: `pin_attempt_logs.ip_address` guarda IP em claro; ausência de MFA aumenta dependência de senha/rate limit; P0 mass assignment; validação Zod não é uniforme. SQL dinâmico usa nomes internos/listas, sem entrada HTTP direta observada.

## 23. PWA

Service worker versionado registra, ativa imediatamente, apaga caches antigos e não cacheia `/api`, `/admin`, `/platform`, downloads ou JSON. Páginas usam network-only. PASS estático; atualização em dispositivo real não testada.

## 24. APIs

Rotas públicas usam tenant explícito e service client scoped; admin usa bearer e contexto. Tratamento de erros central mascara detalhes em produção e propaga requestId. Diversos endpoints antigos usam validação manual/`any`; o maior impacto é o P0 employee bulk. Matriz resumida: public clock/PIN possuem rate limit; admin login possui rate limit; APIs administrativas não têm rate limit geral, mas exigem Auth; platform exige superadmin; internal exige segredo.

## 25. Environment

`.env.example` separa chaves públicas, service role e secrets; APP_URL valida duplicação, HTTPS e localhost em produção; timezone padrão é Fortaleza. Existem fallbacks históricos `America/Sao_Paulo` nas migrations 025/051, geralmente inalcançáveis porque branch/session timezone é obrigatório, mas devem ser normalizados. `validate-env` falhou: todas as variáveis reais estão ausentes.

## 26. Vercel

As rotas declaram Node runtime quando necessário e não dependem de arquivos locais persistentes. Jobs e geração em memória não estão devidamente preparados para execução real: sem cron/worker e com risco de timeout. Deploy/readiness real: NÃO VALIDADO.

## 27. Testes

| Comando | Resultado desta auditoria | Evidência |
|---|---|---|
| `npm ci` | FAIL | duas tentativas; `ENOSPC: no space left on device` |
| `npm run lint` | NOT RUN efetivo | eslint indisponível após ci falhar |
| `npm run typecheck` | NOT RUN efetivo | tsc indisponível |
| `npm run test` | NOT RUN efetivo | vitest indisponível |
| `npm run build` | NOT RUN efetivo | next indisponível |
| `test:integration:required` | FAIL | TEST_SUPABASE_* e tenants ausentes |
| `test:e2e` | NOT RUN efetivo | Playwright indisponível |
| `npm audit` | FAIL operacional | endpoint/cache indisponível |
| verifier migrations | PASS | exit 0, 55 arquivos sequenciais |
| structure v4/v5.1/v5.3/v5.4 | PASS | exits 0 |
| security:data | PASS | nenhum segredo/dado real encontrado |
| doctor | PASS COM AVISOS | Node 24; sem env; checks online não executados |
| env check | FAIL | configuração real ausente |

Os testes de login obrigatórios não existem como suíte real completa; há testes estáticos do MFA e unitários da máquina de estados. O “load-test-clock” testa busca de funcionários, não writes concorrentes. Mobile cobre essencialmente login e home, não dashboard/funcionários/pontos/folha/relatórios em 360/390/430/tablet.

## 28. CI/CD

Workflow executa ci, estrutura, lint, typecheck, unit, integração obrigatória, audit, build e E2E em Node 22. É fail-closed se secrets RLS não existirem. Não há evidência de run verde nem proteção de branch. PASS COM RESSALVA.

## 29. P0 encontrados

1. **P0-01:** mass assignment com service role permite alterar tenant do funcionário pela API bulk. Detalhes na seção 10.

## 30. P1 encontrados

1. RBAC de escrita incompleto (`payroll.view` altera valores; bulk/reviews sem permission requirement).
2. Coerência membership/admin não imposta por constraint nem conferida integralmente no login.
3. Pré-folha profissional não pagina datasets críticos.
4. Relatórios e export job podem truncar no limite Supabase.
5. Reaprovação de hora extra pode duplicar crédito no banco de horas.
6. Jobs não possuem executor/cron real e confirmação robusta.
7. Login/RLS/migrations/clock concorrente não têm qualificação real obrigatória disponível.

## 31. Riscos residuais

Ambiente real desconhecido; Master duplicado/inativo; migrations parciais; policies finais; backup/PITR; SMTP/observabilidade; quotas Supabase/Vercel; certificado regulatório; malware scanner; carga e recuperação de desastre.

## 32. Matriz de produção

| Área | Status | Nota | P0 | P1 | Evidência |
|---|---|---:|---:|---:|---|
| Arquitetura | PASS COM RESSALVA | 7,0 | 0 | 0 | desenho e build scripts |
| Autenticação | NÃO VALIDADO | 6,0 | 0 | 0 | código bom; sem Auth real |
| Master/Admin | NÃO VALIDADO | 4,0 | 0 | 1 | vínculo não constrained |
| RBAC | FAIL | 4,0 | 0 | 1 | payroll-items/bulk/reviews |
| RLS | NÃO VALIDADO | 5,0 | 0 | 0 | SQL presente; sem catálogo/teste A/B |
| Multitenancy | FAIL | 3,0 | 1 | 0 | P0 bulk mass assignment |
| Banco | NÃO VALIDADO | 5,0 | 0 | 0 | sem conexão real |
| Migrations | PASS COM RESSALVA | 6,0 | 0 | 0 | checker estático exit 0 |
| Ponto | NÃO VALIDADO | 6,5 | 0 | 0 | RPC atômica; sem concorrência |
| Escalas | PASS COM RESSALVA | 5,5 | 0 | 0 | RPCs; limite 1000 |
| Banco de horas | PASS COM RESSALVA | 7,0 | 0 | 0 | ledger/advisory lock |
| Horas extras | FAIL | 4,5 | 0 | 1 | dupla aprovação |
| Pré-folha | FAIL | 4,0 | 0 | 1 | datasets não paginados |
| Relatórios | FAIL | 4,0 | 0 | 1 | truncamento/buffer |
| Jobs | FAIL | 3,0 | 0 | 1 | sem executor real |
| Performance | FAIL | 4,0 | 0 | 0 | vários limites fixos |
| Segurança | FAIL | 5,0 | 1 | 1 | P0 + RBAC; controles bons |
| Erros | PASS COM RESSALVA | 7,0 | 0 | 0 | requestId/sanitização |
| PWA | PASS COM RESSALVA | 7,5 | 0 | 0 | SW estático correto |
| Testes | FAIL | 3,0 | 0 | 1 | ci ENOSPC + suítes ausentes |
| CI/CD | PASS COM RESSALVA | 6,0 | 0 | 0 | workflow forte, run não provado |
| Produção | FAIL | 2,5 | 1 | 7 | ambiente/readiness não validados |

## 33. Notas e matrizes complementares

### Fluxos críticos

| Fluxo | Resultado | Evidência |
|---|---|---|
| Login Master/Admin | NÃO VALIDADO | sem Supabase real |
| Sem MFA | PASS estático / NÃO VALIDADO real | zero challenge operacional |
| Sessão/tenant selector | PASS estático | máquina de estados + cookie HMAC |
| Cadastro funcionário | FAIL segurança | API normal idempotente; bulk P0 |
| Registro ponto/NSR/receipt | NÃO VALIDADO | RPC/triggers corretos; sem DB/carga |
| Escala | PASS COM RESSALVA | RPCs; limite 1000 |
| Hora extra | FAIL | reaprovação duplica crédito |
| Justificativa | PASS COM RESSALVA | storage tenant; scanner ausente |
| Banco de horas | PASS COM RESSALVA | ledger idempotente |
| Pré-folha | FAIL | profissional truncável |
| Relatório/exportação | FAIL | limite PostgREST/buffer |
| Job | FAIL | sem scheduler e leitura truncável |
| Logout | PASS estático | somente ações explícitas |

### 20 arquivos críticos

`auth.ts`, `AdminLogin.tsx`, `AdminShell.tsx`, `admin-auth-state.ts`, `tenant-context.ts`, `tenant-scoped-client.ts`, `branch-permissions.ts`, `authorization.ts`, `environment.ts`, `http.ts`, `admin-login/route.ts`, `admin/me/route.ts`, `employees/bulk/route.ts` (P0), `clock/register/route.ts`, migration 022, migration 051, migration 055, `payroll/professional/route.ts`, `reports/route.ts` e `jobs/process/route.ts`.

### Plano de remediação final

1. **P0:** whitelist estrita no employee bulk; tornar tenant_id imutável no proxy/banco; validar filial tenant-scoped; teste API Tenant A/B. Aceite: payload com tenant/id/pin_hash retorna 422 e nenhuma linha muda.
2. **P1:** exigir permissions de escrita em todas as rotas; teste por role. Aceite: view-only recebe 403.
3. **P1:** adicionar constraint/trigger composta membership-admin-auth e conferência no `auth.ts`; rodar precheck sem promoção automática.
4. **P1:** paginar todos os datasets de payroll profissional, relatórios e jobs; testes >10 mil funcionários/>100 mil pontos.
5. **P1:** tornar overtime transition idempotente por review/destino e reconciliar diferenças; teste de dupla aprovação/reprocessamento.
6. **P1:** configurar cron/worker real, heartbeat e RPC de complete; monitorar dead letter.
7. **P1:** subir Supabase efêmero/homologação e executar LOGIN-01..10, DB-01..06, CLOCK-01..08, PAYROLL-01..06, 10 e 70 concorrentes, mobile 360/390/430/tablet e deploy/readiness Vercel.
8. **P2:** paginação das listas administrativas, geração streaming/assíncrona, anonimização de IP, normalização timezone e scanner de malware.

## 34. Veredito final

**C — NÃO PRONTO PARA PRODUÇÃO.** Existe um P0 explorável de integridade multitenant e sete P1. Além disso, não há evidência executada do banco real, login Master/Admin, isolamento RLS, concorrência, migrations aplicadas ou Vercel. O sistema pode seguir para nova remediação e homologação; não deve operar com dados reais antes de corrigir P0/P1 e obter uma matriz integralmente PASS em ambiente de teste representativo.
