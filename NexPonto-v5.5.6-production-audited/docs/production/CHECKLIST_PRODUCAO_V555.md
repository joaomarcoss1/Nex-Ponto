# Checklist de Produção v5.5.5

- `npm ci` executado com Node 22.
- `npm run validate:env` aprovado com variáveis reais de produção.
- `npm run migrations:check`, `npm run structure:v55`, `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` aprovados.
- `FEATURE_OFFICIAL_PAYROLL=false`.
- `SUPABASE_SERVICE_ROLE_KEY`, salts e tokens marcados como sensitive/secret na Vercel.
- `NEXT_PUBLIC_SUPABASE_*` não é obrigatório para login; `/api/public/runtime-config` responde sem secrets.
- Login master e admin comum validado por e-mail + senha, sem MFA obrigatório.
- Usuário com duas empresas redireciona para seleção de empresa.
- Ausência de secret de jobs/recibo/device não bloqueia login administrativo.
- Bucket `exports` privado e aceitando `text/plain` para export regulatório.
- Scheduler externo configurado ou status operacional documentado como indisponível.
- RLS/IDOR testado em homologação com tenants A/B reais.
