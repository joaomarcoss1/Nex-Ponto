# Deploy NexPonto v5.5.6

## Antes do deploy

- Fazer backup do banco Supabase.
- Aplicar migrations até `059_nexponto_v556_final_auth_production_hardening.sql`.
- Confirmar `.env.local` ou variáveis do provedor com secrets reais, sem `TEST_SUPABASE_*` em produção.
- Rodar `npm run validate:env`, `npm run migrations:check`, `npm run structure:v56`, `npm run test` e `npm run build`.

## Homologação obrigatória

- Executar `scripts/sql/precheck-master-v56.sql` informando `app.master_admin_email`.
- Entrar como admin/master usando apenas e-mail e senha.
- Criar empresa, filial, funcionário e administrador.
- Editar/desativar/reativar administrador e confirmar sincronização em `tenant_memberships`.
- Registrar ponto no mobile e abrir o comprovante.
- Rodar readiness em `/api/readiness`.

## Rollback

A migration 059 é incremental e aditiva. Em caso de regressão, faça rollback da aplicação para a versão anterior estável e interrompa workers que chamem jobs v5.5.6. Não remova colunas, funções ou dados em emergência sem migration própria e backup validado.
