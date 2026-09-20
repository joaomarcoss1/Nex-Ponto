# Deploy NexPonto v5.5.5

## Ordem segura

1. Faça backup do banco e storage antes de aplicar migrations.
2. Rode `scripts/sql/precheck-v555.sql` no banco de homologação.
3. Aplique as migrations até `058_nexponto_v555_production_recovery.sql`.
4. Rode `scripts/sql/postcheck-v555.sql`.
5. Configure as variáveis Vercel core: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `TENANT_CONTEXT_SECRET`, `RATE_LIMIT_HASH_SALT`, `AUDIT_HASH_SALT`.
6. Configure portal/ponto e jobs conforme o escopo habilitado.
7. Faça deploy com Node 22 e npm 10.
8. Verifique `/api/health`, `/api/readiness`, login master, login admin comum e seleção multiempresa.

## Jobs

`JOB_EXECUTION_MODE=external` é o padrão recomendado. No plano Hobby, o projeto não usa cron a cada minuto. Use Vercel Pro Cron, Supabase Cron/Edge Function ou scheduler externo chamando `POST /api/internal/jobs/process` com `Authorization: Bearer $CRON_SECRET`.

## Rollback

Faça rollback da aplicação para o ZIP anterior sem apagar dados. A migration 058 é aditiva e pode permanecer instalada. Se o problema envolver jobs, pause o scheduler externo temporariamente. Não execute `DROP CASCADE`, `TRUNCATE` ou reset do banco em produção.
