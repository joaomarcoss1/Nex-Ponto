# Checklist de produção — NexPonto v5.5.2

Data da auditoria local: 18/08/2026.

Status usados:

- `PASS`: comprovado neste pacote/workspace.
- `PENDING EXTERNAL`: exige Supabase/Vercel/contas reais não fornecidos.
- `FAIL`: evidência de falha. Nenhum item local permaneceu em `FAIL`.

## Código, build e segurança

| Verificação | Status | Evidência |
|---|---|---|
| `npm ci` com npm 10.9.2 | PASS | 562 pacotes instalados; audit da instalação sem vulnerabilidades |
| lint | PASS | ESLint sem erros ou warnings |
| typecheck | PASS | TypeScript sem erros |
| unit tests | PASS | 26 arquivos, 83 testes |
| build Next.js | PASS | 58 páginas geradas; build de produção concluído |
| migration verifier | PASS | 55 migrations sequenciais e migration 055 validada |
| estrutura v4/v5.1/v5.3/v5.4 | PASS | todos os verificadores estruturais concluídos |
| varredura de segredos/dados reais | PASS | nenhum segredo, CPF real ou marca legada encontrado |
| audit de dependências de produção | PASS | 0 vulnerabilidades |
| desktop/mobile smoke | PASS | 6 cenários Chromium, incluindo Pixel 7 e overflow horizontal |
| service worker sem cache administrativo | PASS | `/api`, `/admin` e `/platform` fora do cache |
| timezone padrão Fortaleza | PASS | código, contratos, exemplo de ambiente e defaults novos |

## Login administrativo

| Verificação | Status | Evidência |
|---|---|---|
| e-mail + senha suficientes | PASS | fluxo operacional não chama enroll/challenge/verify |
| segundo fator não obrigatório em produção | PASS | nenhuma condição por `NODE_ENV`, AAL ou fator antigo |
| rota legada de segundo fator | PASS | redireciona diretamente para `/admin` |
| 500/503 não fazem logout | PASS | classificador e testes unitários |
| timeout não faz logout | PASS | estado `temporary_error` com retry e sessão preservada |
| 401 de sessão expirada volta ao login | PASS | estado e teste unitário |
| 409 abre seletor de tenant | PASS | estado e teste unitário |
| 403 mostra bloqueio estável | PASS | não encerra a sessão |
| login master real | PENDING EXTERNAL | requer `MASTER_ADMIN_EMAIL`, senha e Supabase de homologação |
| login admin real | PENDING EXTERNAL | requer conta admin e Supabase de homologação |
| usuário real com fator TOTP antigo | PENDING EXTERNAL | requer usuário de Auth com fator legado |

## Banco, tenant e operações

| Verificação | Status | Evidência |
|---|---|---|
| migration 055 aplicada | PENDING EXTERNAL | executar no Supabase alvo |
| precheck/postcheck | PENDING EXTERNAL | scripts entregues em `scripts/sql` |
| cadeia master/admin/membership/tenant | PENDING EXTERNAL | validada pelo postcheck e doctor quando houver credenciais |
| service role real | PENDING EXTERNAL | readiness e doctor validam sem expor a chave |
| buckets `exports` e `payroll-exports` | PENDING EXTERNAL | migration cria; readiness confirma após deploy |
| RLS tenant A/B | PENDING EXTERNAL | 3 testes existem; foram ignorados localmente por falta das variáveis `TEST_*` |
| cadastro real de empresa | PENDING EXTERNAL | requer platform superadmin e banco migrado |
| cadastro real de funcionário | PENDING EXTERNAL | requer tenant/filial e banco migrado |
| concorrência de 70 funcionários no ponto | PENDING EXTERNAL | requer endpoint implantado e massa de homologação |
| 10 requests do mesmo funcionário | PENDING EXTERNAL | requer endpoint implantado; RPC já possui idempotência/lock |
| reexecução real das migrations | PENDING EXTERNAL | executar duas vezes no clone de homologação |
| EXPLAIN de consultas críticas | PENDING EXTERNAL | requer estatísticas e volume do banco real |

## Vercel e operação

| Verificação | Status | Evidência |
|---|---|---|
| compatibilidade serverless | PASS | build Next.js e rotas dinâmicas concluídos |
| variáveis Vercel reais | PENDING EXTERNAL | preencher e validar com `npm run doctor`/`/api/readiness` |
| scheduler de jobs | PENDING EXTERNAL | configurar cron/executor com `INTERNAL_JOBS_SECRET` |
| deploy e smoke pós-deploy | PENDING EXTERNAL | executar após migration e configuração |

## Gate final

O pacote está aprovado localmente, mas **não deve ser declarado pronto para produção** enquanto os itens `PENDING EXTERNAL` de login real, migration, RLS e concorrência não forem executados no ambiente de homologação.

Confirmação de arquitetura: **MFA NÃO É EXIGIDO PARA MASTER OU ADMINISTRADORES**.

Confirmações que dependem de ambiente real:

- `MASTER LOGIN TESTADO`: PENDING EXTERNAL.
- `ADMIN LOGIN TESTADO`: PENDING EXTERNAL.
- `SEM LOOP DE LOGIN`: PASS nos estados unitários/E2E; PENDING EXTERNAL para sessão real.
