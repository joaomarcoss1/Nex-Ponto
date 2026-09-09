# Deploy NexPonto v5.5.3

1. Use Node 22 e npm 10.9.2; rode `npm ci` e `npm run verify:production`.
2. Faça backup e clone de homologação antes da migration 056. Não aplique se o precheck retornar valor diferente de zero.
3. Configure as variáveis de `.env.example`, inclusive `CRON_SECRET`, `INTERNAL_JOBS_SECRET`, salts, secrets de sessão, URLs e chaves Supabase server-only.
4. Mantenha `FEATURE_PRE_PAYROLL=true` e `FEATURE_OFFICIAL_PAYROLL=false` até homologação formal.
5. Mantenha `ATTACHMENT_SCANNER_ENABLED=false` enquanto não houver scanner; a UX mostrará `scanner_unavailable`, nunca `clean`.
6. Confirme buckets privados `exports` e `payroll-exports`, policies por tenant e signed URLs.
7. Implante no Vercel; os Crons autenticados chamam `/api/internal/jobs/process` a cada minuto e `/api/internal/jobs/holidays` diariamente.
8. Valide `/api/health` para liveness e `/api/readiness` para configuração, Auth/service role, banco, storage, migration 5.5.3 e funções críticas.
9. Execute login Master/Admin somente por e-mail+senha. MFA/TOTP/AAL2 não fazem parte do fluxo.
10. Em rollback de aplicação, não reverta/destrua dados da migration. Volte o artefato e preserve schema; qualquer correção de vínculo ou ledger deve ser auditada.

Dependências externas obrigatórias: Supabase homologado, secrets reais, Cron Vercel, backup/PITR conforme o plano contratado, teste de restore e observabilidade configurada.
