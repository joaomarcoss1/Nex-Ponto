# Auditoria de produção — NexPonto v5.5.2

## Status executivo

A base recebida era a v5.4.2. Ela foi elevada para v5.5.2 com correções de causa raiz no login, criação de empresas e funcionários, migrations, readiness, cache PWA, paginação e responsividade.

O pacote está aprovado nas verificações locais. A homologação com o Supabase real permanece obrigatória e está descrita como `PENDING EXTERNAL` no checklist; nenhuma validação externa foi apresentada como concluída sem evidência.

## 1. Problemas encontrados e causa raiz

1. O login forçava segundo fator sempre em produção ou quando o Supabase indicava um próximo nível AAL2. Um fator TOTP antigo, mesmo opcional, redirecionava o usuário.
2. `AdminShell` tratava qualquer exceção de sessão, rede, banco ou ambiente como falha de autenticação e executava `router.replace('/admin/login')`.
3. O cache de perfil podia liberar conteúdo antes de `/api/admin/me` concluir a validação.
4. O backend de suporte e platform superadmin ainda retornava `MFA_REQUIRED`.
5. A criação de empresa apagava o usuário Auth recém-criado quando o RPC do tenant falhava, contrariando a preservação de dados e dificultando retry.
6. A interface gerava uma nova chave de idempotência em toda tentativa de criar empresa; um timeout seguido de retry podia duplicar a operação.
7. O cadastro de funcionário não possuía chave persistente de criação; retry após timeout podia repetir funcionário, salário e escala.
8. A API de permissões estava dividida entre a versão v54 e nomes históricos.
9. Readiness não diferenciava Auth, migrations, RPCs críticas e buckets.
10. Consultas críticas ainda podiam parar no limite padrão de 1000 linhas do Supabase.
11. O service worker usava cache antigo v5.2 e permitia fallback genérico de páginas.
12. O fuso padrão ainda era São Paulo em vários fallbacks, embora a regra solicitada fosse Fortaleza.

## 2. Correções implementadas

- Endpoint same-origin de login administrativo com rate limit distribuído por IP e conta, resposta uniforme para credenciais inválidas e auditoria por hashes.
- Persistência explícita da sessão Supabase no navegador com `setSession`; o client único mantém `persistSession` e `autoRefreshToken`.
- Máquina de estados administrativa com `checking`, `ready`, `temporary_error`, `fatal_error` e `redirecting`.
- Somente sessão ausente/inválida/expirada redireciona para login. 5xx, timeout e falhas de rede preservam a sessão e exibem retry, sair e requestId.
- Cache de perfil deixou de substituir a validação de segurança.
- Fluxos operacionais de master, admin, platform e suporte não executam segundo fator.
- Rota legada `/admin/seguranca-mfa` preservada somente para compatibilidade de favoritos/PWA e redirecionada ao painel.
- Criação de empresa preserva o usuário Auth e mantém a mesma chave idempotente em retry.
- Cadastro de funcionário usa `creation_request_id` e `upsert_employee_v552`, com advisory lock e retorno do mesmo registro após retry.
- Reconciliação `reconcile_admin_memberships_v55()` conservadora, idempotente, transacional e auditada; não promove usuários comuns a master.
- `has_tenant_permission(uuid,text)` virou a implementação canônica; a função v54 delega para ela.
- Buckets privados `exports` e `payroll-exports` criados idempotentemente.
- Readiness valida configuração, service role/Auth, banco, storage, migration 5.5.2 e funções críticas.
- Paginação completa adicionada a funcionários, escalas publicadas, horas extras e pré-folha.
- PWA atualizada para cache v5.5.2 apenas de assets estáticos.
- Fuso padrão alterado para `America/Fortaleza` sem reescrever tenants/filiais já configurados.

## 3. Arquivos alterados

### Autenticação, sessão e erros

- `src/components/admin/AdminLogin.tsx`
- `src/components/admin/AdminShell.tsx`
- `src/app/api/auth/admin-login/route.ts`
- `src/app/api/admin/me/route.ts`
- `src/app/api/platform/support-sessions/route.ts`
- `src/lib/client/admin-api.ts`
- `src/lib/client/admin-auth-state.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/http.ts`
- `src/lib/config/environment.ts`
- `src/lib/contracts/application-errors.ts`
- `src/app/admin/seguranca-mfa/page.tsx`
- removido: `src/lib/security/mfa.ts`

### Cadastros, paginação, timezone e plataforma

- `src/app/api/platform/tenants/route.ts`
- `src/app/platform/page.tsx`
- `src/components/admin/ResourceManager.tsx`
- `src/app/api/admin/employees/route.ts`
- `src/app/api/admin/admins/route.ts`
- `src/app/api/admin/bootstrap-master/route.ts`
- `src/app/api/admin/payroll/route.ts`
- `src/app/api/admin/overtime-reviews/route.ts`
- `src/lib/services/schedule-engine.ts`
- `src/lib/server/pagination.ts`
- `src/app/api/readiness/route.ts`
- `src/lib/constants.ts`
- `src/lib/contracts/branch.ts`
- `src/lib/contracts/tenant-onboarding.ts`
- `src/components/admin/BranchesPage.tsx`
- `src/components/admin/TimeEntriesPage.tsx`
- rotas de ponto, histórico, portal, dashboard e bootstrap com fallback Fortaleza
- `public/sw.js`

### Banco, automação, testes e documentação

- `supabase/migrations/055_nexponto_v552_production_auth_stability.sql`
- `scripts/sql/precheck-v552.sql`
- `scripts/sql/postcheck-v552.sql`
- `scripts/doctor-vscode.mjs`
- `scripts/validate-env.mjs`
- `scripts/verify-migrations.mjs`
- `scripts/verify-v54-remediation.mjs`
- `.github/workflows/ci.yml`
- `.env.example`, `.gitignore`, `eslint.config.mjs`
- `package.json`, `package-lock.json`
- testes novos de auth state, environment, ausência de challenge e E2E responsivo

## 4. Migration nova

- `055_nexponto_v552_production_auth_stability.sql`

Ela é incremental e reexecutável: usa `IF NOT EXISTS`, `CREATE OR REPLACE`, índices parciais idempotentes e não apaga histórico. A aplicação e reexecução em um clone do banco são pendências externas.

## 5. Testes e resultados locais

| Teste | Resultado |
|---|---|
| npm ci | PASS |
| lint | PASS |
| typecheck | PASS |
| unit | PASS — 83/83 |
| integration | PENDING EXTERNAL — 3 testes ignorados sem `TEST_*` |
| E2E desktop/mobile | PASS — 6 cenários executados |
| migrations:check | PASS — 55 migrations |
| structure v4/v5.1/v5.3/v5.4 | PASS |
| security:data | PASS |
| npm audit produção | PASS — 0 vulnerabilidades |
| build | PASS |

## 6. Riscos residuais e configurações externas

1. Aplicar a migration 055 no clone de homologação, rodar precheck/postcheck e reexecutar a migration.
2. Configurar variáveis reais no Vercel, executar `npm run doctor` e validar `/api/readiness`.
3. Testar master/admin reais, inclusive usuário com fator antigo cadastrado.
4. Executar testes RLS A/B e os cenários de concorrência de ponto com massa real.
5. Configurar e observar os jobs Vercel com `INTERNAL_JOBS_SECRET`.
6. Executar smoke pós-deploy de empresa, filial, funcionário, ponto, recibo, pré-folha e relatório.

## 7. Confirmações

**MFA NÃO É EXIGIDO PARA MASTER OU ADMINISTRADORES.**

`MASTER LOGIN TESTADO`: PENDING EXTERNAL — não foram fornecidos Supabase/credenciais reais.

`ADMIN LOGIN TESTADO`: PENDING EXTERNAL — não foram fornecidos Supabase/credenciais reais.

`SEM LOOP DE LOGIN`: PASS nos testes de estados e E2E; homologação com sessão real ainda é PENDING EXTERNAL.
