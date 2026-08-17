# Changelog NexPonto v5.5.1

## Production blocker remediation

- adicionada migration `056_nexponto_v551_production_blockers.sql`;
- revogada execução pública/anon/authenticated de RPCs administrativas e sensíveis;
- corrigidas `disable_tenant_admin_v55` e `reactivate_tenant_admin_v55` para preservar permissões existentes;
- adicionada auditoria real de grants via `audit_sensitive_security_definer_grants_v551`;
- adicionada agregação `hour_bank_summary_v551` para banco de horas histórico;
- folha profissional passou a paginar coleções grandes e usar resumo SQL de banco de horas;
- relatórios de faltas, funcionário, filial, almoço, pontos, justificativas, inconsistências, horas extras e pré-folha passaram por paginação completa;
- worker regulatório passou a paginar `time_entries`;
- settings empresariais passaram a ler/gravar em `tenant_settings`;
- endpoint público de dispositivo ganhou rate limit pré-cookie por tenant/IP;
- upload de anexos fica bloqueado por padrão sem scanner real;
- pós-processamento do ponto passou a tratar erro de dispositivo, vínculo e risco;
- `requestId` passou a ser cacheado por `Request`;
- adicionados scripts `structure:v551`, `audit:security-definer` e `test:load:clock-register`;
- adicionados testes de paginação > 5.000 linhas e request-id estável.
