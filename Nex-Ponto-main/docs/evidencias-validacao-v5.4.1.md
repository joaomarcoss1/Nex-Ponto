# NexPonto v5.4.1 - Evidências de Validação

Data: 2026-08-16

## Validações Aprovadas

| Comando | Resultado |
| --- | --- |
| `npm ci` | 562 pacotes instalados, 0 vulnerabilidades |
| `npm run typecheck` | aprovado |
| `npm run lint` | aprovado |
| `npm run test` | 24 arquivos, 74 testes aprovados |
| `npm run migrations:check` | 54 migrations verificadas |
| `npm run structure:check` | estrutura base aprovada |
| `npm run structure:v51` | 14 verificações aprovadas |
| `npm run structure:v53` | 8 controles aprovados |
| `npm run structure:v54` | controles de remediação aprovados |
| `npm run security:data` | nenhum dado real, segredo conhecido, CPF formatado ou marca legada encontrado |
| `npm run audit` | 0 vulnerabilidades high em produção |
| `npm run audit:dead-code` | auditoria conservadora concluída, sem remoção automática |
| `npm run build` | build Next.js aprovado, 58 páginas estáticas geradas |
| `npm run test:e2e` | 2 testes Playwright aprovados em desktop e mobile |

## Validações Bloqueadas por Ambiente Local

| Comando | Motivo |
| --- | --- |
| `npm run env:check` | faltam variáveis reais: Supabase, service role, secrets e APP_URL |
| `npm run validate:env` | mesmo bloqueio, em modo produção |
| `npm run audit:database` | requer `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` reais |
| `npm run test:integration` | executado, mas os testes RLS foram pulados por falta de credenciais `TEST_SUPABASE_*` |

## Regressões Cobertas por Teste

- O erro `RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.` não é mais exibido ao usuário.
- Mensagens de infraestrutura 5xx, como erro de tabela ausente, são convertidas para mensagem pública genérica.
- Payloads legados `{ error: string }` continuam funcionando, mas passam por sanitização.
- O contrato de erro inclui `requestId` no topo e em `error.requestId`.

## Prévias Geradas

As imagens foram salvas fora do projeto, em:

- `C:\Users\joaom\Documents\Codex\2026-07-30\aplique-es\outputs\nexponto-v5.4.1-public-clock-desktop.png`
- `C:\Users\joaom\Documents\Codex\2026-07-30\aplique-es\outputs\nexponto-v5.4.1-public-clock-mobile.png`
- `C:\Users\joaom\Documents\Codex\2026-07-30\aplique-es\outputs\nexponto-v5.4.1-public-clock-desktop-after-error.png`
- `C:\Users\joaom\Documents\Codex\2026-07-30\aplique-es\outputs\nexponto-v5.4.1-admin-login-desktop.png`
- `C:\Users\joaom\Documents\Codex\2026-07-30\aplique-es\outputs\nexponto-v5.4.1-admin-login-mobile.png`

Na prévia pública automatizada:

- `RATE_LIMIT_HASH_SALT`: 0 ocorrências visíveis.
- `TENANT_CONTEXT_SECRET`: 0 ocorrências visíveis.
- Ambiente sem Supabase real exibiu mensagem operacional amigável em vez de erro técnico.

## Observação de Produção

O pacote é um candidato de produção validado localmente. A liberação final precisa ser feita com `.env` real, banco Supabase aplicado e auditoria de banco executada no ambiente definitivo.
