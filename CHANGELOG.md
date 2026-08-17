# Changelog

## 5.4.0 — 2026-08-07

### Estrutura, segurança e estabilidade

- ambiente e URL oficial centralizados, readiness separado de liveness;
- erros padronizados e mensagens técnicas restritas aos logs;
- convite disparado somente após tenant/proprietário/onboarding transacionais;
- estado persistente de convite, reenvio recuperável e compensação segura;
- normalização compatível de `tenant_features` e hardening de RLS/grants/Storage;
- MFA mantido como recurso opcional conforme política atual;
- filial e funcionamento salvos em uma única transação PostgreSQL;
- rate limit adicional nos acessos públicos e limite de funcionários do plano;
- identidade institucional bloqueada em azul/branco/dourado por padrão.

### Mobile, qualidade e operação

- drawer com safe area e restauração correta do overflow;
- componentes responsivos para toolbar, forms, tabs, cards e modal;
- fallback de mapa sem iframe quebrado;
- Error Boundaries separados para Admin e Master;
- scripts de auditoria do banco, código morto, carga do caminho público e gate de integração;
- migrations incrementais 053 e 054, sem alteração das 52 migrations históricas.
- overrides de segurança atualizados para `brace-expansion` 5.0.9 e PostCSS 8.5.23 após advisories de agosto/2026.
- script `npm start` restaurado para execução do build de produção.

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
