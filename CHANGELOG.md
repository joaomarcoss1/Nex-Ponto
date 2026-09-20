# Changelog

## 5.5.4 — 2026-08-19

- PIN em massa validado por contrato e persistido em RPC transacional antes de ser apresentado;
- scanner de dados sensíveis corrigido e coberto por testes de nome de variável versus segredo real;
- relatório genérico sem limite absoluto de 5.000 e com falhas explícitas de teto/timeout;
- jobs com claim/fail v5.5.4, recuperação de lease e dead-letter verificável;
- IP bruto removido dos metadados de exportação;
- confirmações destrutivas acessíveis e responsividade ampliada de 360 a 1440 px;
- migration 057, precheck/postcheck, readiness, doctor e runbook de backup atualizados;
- MFA permanece fora do fluxo operacional de Master/Admin.

## 5.5.3 — 2026-08-18

- bulk de funcionários com Zod strict, whitelist e proteção IDOR/cross-tenant;
- `tenant_id` imutável no cliente privilegiado e no banco;
- RBAC de escrita por método/rota e identidade composta Auth/Admin/Membership;
- pré-folha e relatórios com paginação completa e limites operacionais explícitos;
- hora extra idempotente por revisão, sem crédito duplicado;
- Vercel Cron autenticado, paginação, heartbeat e conclusão transacional de jobs;
- IP de tentativas de PIN pseudonimizado e readiness atualizado para a migration 5.5.3;
- MFA permanece desativado e não é requisito de login.

## 5.5.2 — 2026-08-18

### Login, dados e produção

- login administrativo por e-mail e senha, sem segundo fator obrigatório;
- falhas 5xx, timeout e infraestrutura preservam a sessão e exibem retry/requestId;
- rate limit de login por conta/IP e auditoria somente por hashes;
- empresa e funcionário com retry idempotente e sem apagar usuários Auth;
- reconciliação conservadora de admins/memberships e permissão canônica;
- paginação de funcionários, escalas, horas extras e pré-folha;
- readiness ampliado, cache PWA v5.5.2, precheck/postcheck e doctor online;
- migration incremental 055 e documentação de homologação externa.

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
