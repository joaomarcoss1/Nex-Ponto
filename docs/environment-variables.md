# Variaveis de Ambiente

Use `.env.example` como fonte atual.

## Obrigatorias em qualquer ambiente funcional

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TENANT_CONTEXT_SECRET`, `EMPLOYEE_SESSION_SECRET`, `AUDIT_HASH_SALT`, `RATE_LIMIT_HASH_SALT`, `INTERNAL_JOBS_SECRET`, `DEVICE_IDENTITY_SECRET`, `RECEIPT_TOKEN_SECRET`, `NEXT_PUBLIC_APP_URL`, `DEFAULT_TIMEZONE`, `REPORT_EXPORT_BUCKET`, `EXPORTS_BUCKET`, `JOB_WORKER_ID`, `MALWARE_SCANNER_MODE`.

## Obrigatorias em gate de producao/homologacao

`OBSERVABILITY_DSN`, `OBSERVABILITY_ENVIRONMENT`, SMTP, variaveis `TEST_SUPABASE_*`, fixtures `TEST_STORAGE_*` e `BACKUP_RESTORE_EVIDENCE_URL`.

## Flags regulatorio/folha

`FEATURE_OFFICIAL_PAYROLL=false` deve permanecer falso ate homologacao formal. `MFA_ENFORCEMENT_ENABLED=true` e `NEXT_PUBLIC_MFA_ENFORCEMENT_ENABLED=true` sao obrigatorios em gate.

## Validacao

Execute `npm run env:check`. Em CI use `PRODUCTION_SECURITY_GATES=true`.

