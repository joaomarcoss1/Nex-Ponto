# Deploy NexPonto v5.5.7

## Ordem obrigatória

1. Fazer backup restaurável do banco e registrar o ponto de rollback.
2. Configurar Node 22 LTS e npm 10.
3. Preencher as variáveis reais conforme `.env.example`; não usar placeholders nem `TEST_SUPABASE_*` em produção.
4. Executar `scripts/sql/precheck-v557.sql`. Qualquer linha `FAIL` bloqueia o deploy.
5. Aplicar as migrations, em ordem, até `060_nexponto_v557_final_production_validation.sql`.
6. Rodar `npm ci`, `npm run verify` e `npm run test:integration:required` no ambiente de homologação.
7. Publicar a aplicação e executar `scripts/sql/postcheck-v557.sql`.
8. Confirmar HTTP 200 e `version=5.5.7` em `/api/readiness`.

## Homologação funcional obrigatória

- Entrar como proprietário/master e como administrador usando e-mail e senha. Esta versão não adiciona MFA/2FA obrigatório.
- Criar uma empresa com proprietário, selecionar o tenant e confirmar o primeiro acesso.
- Criar, editar, desativar e reativar filial, funcionário e administrador.
- Verificar que `admin_users.role/branch_ids` e `tenant_memberships.role/branch_ids` permanecem consistentes.
- Tentar remover/rebaixar o último master efetivo e confirmar a rejeição.
- Registrar ponto em dispositivo mobile, repetir a mesma requisição e confirmar idempotência/recibo.
- Executar um job até a conclusão, acompanhando claim, heartbeat, retry e lease.
- Conferir auditoria, exportação, pré-folha, relatórios e isolamento entre dois tenants reais.

## Variáveis e operação

- `DEFAULT_TIMEZONE` deve ser um fuso IANA válido.
- `CRON_SECRET` e `INTERNAL_JOBS_SECRET` devem ser diferentes, longos e armazenados como secrets.
- O cron `/api/internal/jobs/process` está configurado a cada cinco minutos; ajuste a cadência somente após teste de carga.
- Remova `MASTER_SETUP_TOKEN` e senhas temporárias logo após o bootstrap.
- Monitore `ADMIN_AUTH_UPDATE_FAILED`, `ADMIN_SYNC_PARTIAL_FAILURE`, jobs expirados e readiness.

## Rollback

A migration 060 é aditiva e mantém os contratos anteriores. Em incidente, interrompa o cron/worker, reverta a aplicação para a versão estável anterior e preserve a migration aplicada. Não apague funções, memberships ou usuários Auth durante a emergência. Faça qualquer reversão de dados por migration específica, depois de restaurar/testar o backup.
