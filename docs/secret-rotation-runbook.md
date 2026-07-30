# Runbook de Rotacao de Segredos

1. Gerar novo segredo com pelo menos 32 caracteres aleatorios.
2. Publicar em ambiente de homologacao.
3. Reiniciar aplicacao e workers.
4. Executar `npm run env:check`, testes de login, MFA, PIN, jobs e URL assinada.
5. Publicar em producao em janela controlada.
6. Revogar segredo antigo no provedor.
7. Registrar auditoria da troca.

Segredos que exigem rotacao periodica: `SUPABASE_SERVICE_ROLE_KEY`, `TENANT_CONTEXT_SECRET`, `EMPLOYEE_SESSION_SECRET`, `AUDIT_HASH_SALT`, `RATE_LIMIT_HASH_SALT`, `INTERNAL_JOBS_SECRET`, `DEVICE_IDENTITY_SECRET`, `RECEIPT_TOKEN_SECRET`, SMTP e observabilidade.

