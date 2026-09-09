# Checklist de Produção v5.5.6

- `npm ci` executado com Node 22.
- `npm run validate:env` aprovado com URLs HTTPS reais.
- `npm run migrations:check` aprovado.
- `npm run structure:v56` aprovado.
- `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` aprovados.
- Migration 059 aplicada no Supabase real.
- `/api/readiness` retornando `ready`.
- Admin master entra com e-mail/senha, sem MFA operacional.
- Cadastro de empresa, filial, funcionário e administrador homologado.
- Registro de ponto mobile gera sucesso, NSR e comprovante.
- Worker de exportação processa job com `lease_token`.
- Buckets `exports` e `payroll-exports` existem e aceitam os MIME types configurados.
- Precheck `scripts/sql/precheck-master-v56.sql` retorna `PASS_MASTER_ADMIN_LOGIN_CHAIN`.
