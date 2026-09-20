# Deploy e homologação — NexPonto 5.5.4

## Ordem obrigatória

1. Use Node 22 e npm 10.
2. Configure as variáveis de `.env.example` no ambiente de homologação, mantendo `FEATURE_PRE_PAYROLL=true`, `FEATURE_OFFICIAL_PAYROLL=false` e `ATTACHMENT_SCANNER_ENABLED=false` enquanto não existir scanner real.
3. Execute `scripts/sql/precheck-v554.sql`; todas as linhas devem retornar zero.
4. Confirme backup e restauração conforme `BACKUP_RESTORE.md`.
5. Aplique somente migrations pendentes, terminando em `057_nexponto_v554_final_production_hardening.sql`.
6. Execute `scripts/sql/postcheck-v554.sql`; o resultado deve ser `PASS`.
7. Faça o deploy e confirme `/api/health` (liveness) e `/api/readiness` (dependências reais).
8. Execute `npm run test:integration:required` com Tenant A/B descartáveis.
9. Execute `npm run test:load:clock` com os 10 requests concorrentes e a lista de até 150 funcionários de homologação.
10. Teste login, reload, refresh, logout e senha inválida para Master e Admin comum. Nenhum fluxo pode solicitar MFA.

## Go/no-go

Não liberar se qualquer item abaixo estiver `FAIL` ou `NOT RUN`:

- Master e Admin comum com tenant/permissões corretos;
- RLS e tentativas cruzadas Tenant A/B;
- PIN retornado autenticável e lote atômico;
- ponto concorrente, NSR e recibo;
- reaprovação de overtime sem crédito duplicado;
- claim, heartbeat, complete, retry, lease expirado e dead-letter;
- exports privados e paths iniciados por tenant;
- readiness 200;
- CI completa em Node 22;
- restauração de ensaio documentada.

## Rollback

Faça rollback da aplicação para 5.5.3 sem apagar dados. Pare temporariamente o Cron de jobs v5.5.4 se ele for a origem da regressão. As funções da migration 057 são aditivas e podem permanecer até uma migration posterior removê-las com segurança.
