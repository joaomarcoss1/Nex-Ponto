# Changelog

## 5.3.0 — 2026-07-29

### Segurança, ponto e plataforma

- MFA TOTP/AAL2 obrigatório em produção;
- suporte master com menor privilégio, escopo e step-up;
- dispositivo assinado, aprovação/revogação e sinais antifraude explicáveis;
- NSR concorrente por tenant, hash regulatório e comprovante atômico;
- CSP com nonce e catálogo uniforme de erros/correlation ID;
- correção dos fundos verdes residuais para a identidade azul canônica.

### Pré-folha e operação

- permissões distintas de RH, financeiro, fechamento, exportação e reabertura;
- segregação de funções no PostgreSQL e ledger de transições;
- folha oficial e marcação de pagamento bloqueadas;
- previews AFD/AEJ sem alegação de homologação;
- jobs com `SKIP LOCKED`, lease, retry e dead-letter;
- fila LGPD, lifecycle comercial e runbooks de piloto.

## 5.2.0 — 2026-07-29

### Segurança e plataforma

- autorização canônica por permissões e compatibilidade com papéis legados;
- `tenant_owner` alinhado entre menu e APIs;
- sessão temporária de suporte do superadmin, expiração, revogação, banner e auditoria;
- exigência técnica de MFA para perfis críticos quando habilitada/produção;
- CSP, HSTS, request ID e health check;
- validação de assinatura binária e hash de uploads;
- remoção da matrícula completa da busca pública;
- salts obrigatórios, sem fallback conhecido;
- dependências atualizadas/override auditado, com `npm audit` sem vulnerabilidades de produção.

### Funcional

- contrato único de criação de empresa e idempotência;
- contrato único de horas extras, split reconciliado e valor manual opcional;
- saldo de banco de horas calculado pelo sinal contábil;
- salário integral exato para competências de 28, 29, 30 e 31 dias;
- ausências totais derivadas do calendário publicado e efeito financeiro explícito;
- nomenclatura de Pré-folha preservada; folha oficial desativada.

### Identidade e PWA

- `tenant_branding` tornou-se a fonte canônica;
- tema carregado no servidor antes do primeiro paint;
- migração seletiva do verde legado para o azul `#1268F3`;
- contraste automático e tokens semânticos;
- resolução de tenant por domínio, código público, slug e cookie de contexto;
- `start_url` do PWA usa código público.

### Engenharia

- TypeScript ES2022;
- retorno discriminado de autenticação;
- Node 22/npm 10 fixados;
- testes financeiros dourados e testes de contratos/segurança;
- Playwright e suíte de integração preparados;
- CI ampliado.
# 5.3.1-remediated

- Added migration `053_nexponto_v53_final_production_remediation.sql` with private Storage buckets, per-operation Storage policies, v53 RLS helpers, attachment quarantine states, job metadata and direct-write revokes for critical tables.
- Added dedicated signed URL route for justification attachments with tenant, branch, permission, scan-status and canonical path checks.
- Added centralized operational timezone service and tests for Brazilian timezone boundaries.
- Split public health from protected internal readiness/liveness checks.
- Reworked RLS/Storage integration tests so production gates fail when real Supabase fixtures are missing.
- Added attachment scan worker flow, load-test script for real clock registration and operational documentation requested for controlled pilot readiness.
