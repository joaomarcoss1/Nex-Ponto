# Evidencias de Validacao NexPonto v5.5.1

Data: 2026-08-16/17

## Aprovado localmente

| Comando | Resultado |
| --- | --- |
| `npm install --package-lock-only` | PASS, 0 vulnerabilidades |
| `npm install` | PASS, 562 pacotes instalados, 0 vulnerabilidades |
| `npm run doctor` | PASS, estrutura VSCode verificada |
| `npm run migrations:check` | PASS, 56 migrations sequenciais |
| `npm run structure:v551` | PASS, 15 checks v5.5.1 |
| `npm run security:data` | PASS, nenhum segredo/dado real encontrado |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS, 25 arquivos e 78 testes |
| `npm run build` | PASS, 58 paginas/rotas geradas |
| `npm run test:e2e` | PASS, 2 testes Playwright desktop/mobile |
| `npm run audit` | PASS, 0 vulnerabilidades high em producao |

## Bloqueado ou skipped por ambiente

| Comando | Resultado |
| --- | --- |
| `npm run env:check` | BLOQUEADO: variaveis Supabase/secrets ausentes |
| `npm run audit:database` | BLOQUEADO: falta Supabase real e service role |
| `npm run audit:security-definer` | BLOQUEADO: falta Supabase real e service role |
| `npm run test:integration` | SKIPPED: 3 testes RLS pulados por falta de ambiente real |
| `npm run test:load:clock-register` | NOT RUN/BLOQUEADO: falta `LOAD_TEST_BASE_URL`, fixture e confirmacao |

## Observacao E2E

Sem `.env.local`, algumas APIs retornam `503` por configuracao incompleta. O E2E validou que a aplicacao renderiza, mantem branding e headers de seguranca em desktop/mobile, enquanto logs seguem com `requestId`.
