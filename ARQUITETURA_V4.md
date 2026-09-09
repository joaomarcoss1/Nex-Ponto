# Arquitetura NexPonto v4

## Objetivo

A v4 remedia a fundação incompleta da v3 e organiza o produto como SaaS multiempresa. O princípio central é que o tenant não é aceito livremente do frontend: ele é resolvido por membership autenticada, cookie assinado, domínio/código público controlado ou QR vinculado ao tenant.

## Camadas

```text
Web/PWA
  ├─ Portal do funcionário
  ├─ Administração da empresa
  └─ Plataforma NexLabs
        ↓
Next.js APIs / Application Services
  ├─ autenticação e contexto de tenant
  ├─ autorização e limites
  ├─ validação Zod
  ├─ idempotência e auditoria
  └─ adapters externos
        ↓
Supabase/PostgreSQL
  ├─ RLS por tenant e filial
  ├─ RPCs transacionais
  ├─ ledger e work sessions
  ├─ storage por prefixo de tenant
  └─ jobs/auditoria
```

## Identidade e tenancy

- `auth.users`: identidade global de autenticação;
- `tenant_memberships`: vínculo de uma identidade com uma empresa;
- `tenant_member_branches`: escopo de filial;
- `admin_users`: perfil administrativo compatível com os módulos legados;
- `platform_superadmins`: administração da plataforma, separada das empresas;
- cookie HTTP-only assinado: contexto de tenant ativo;
- `TenantSwitcher`: troca explícita da empresa ativa.

Usuários com várias memberships não recebem um tenant implicitamente pela ordem dos registros.

## Isolamento

A migration 021:

- consolida policies antigas em tabelas tenantizadas;
- cria funções como `current_tenant_id`, `current_membership_id`, `has_permission` e `can_access_branch`;
- corrige chaves globais incompatíveis;
- adiciona contexto às tabelas auxiliares;
- cria rate limit compartilhado.

As rotas administrativas usam um cliente defensivo que injeta `tenant_id` e filtros obrigatórios nas tabelas de negócio. Isso é uma contenção para código legado; RLS continua obrigatório e deve ser testado com tokens reais.

## Rotas públicas

`requirePublicTenant` resolve o tenant antes de pesquisar filial, funcionário, QR, ponto, histórico ou branding. Em uma instalação com mais de um tenant, contexto explícito é obrigatório.

## Operações transacionais

RPCs v4 relevantes:

- `register_time_entry_v4`;
- `append_hour_bank_movement_v4`;
- `reverse_hour_bank_movement_v4`;
- `validate_branch_gps_session_v4`;
- `submit_employee_request_v4`;
- `review_employee_request_v4`;
- `upsert_shift_template_v4`;
- `save_schedule_publication_v4`;
- `upsert_employee_v4`;
- `create_manual_time_entry_v4`;
- `bootstrap_tenant_owner_v4`.

Operação crítica, auditoria e idempotência devem compartilhar a mesma transação sempre que a RPC oferece suporte.

## Jornada

`work_sessions` agrupa eventos da mesma jornada, inclusive após a meia-noite. `work_session_events` permite entrada, múltiplos intervalos e saída final sem depender da antiga unicidade “uma ação por dia”.

A resolução de escala prioriza ocorrência publicada e regras vigentes, salvando snapshot da jornada no ponto/sessão.

## Segurança

- PIN com hash e lockout fail-closed;
- rate limit persistente no PostgreSQL;
- QR armazenado por hash e com expiração;
- auditoria sanitiza segredos e usa hash de IP;
- service role permanece restrita a servidor e recebe escopo defensivo;
- jobs internos exigem segredo próprio;
- offline permanece desabilitado por feature flag.

## Limitações que exigem homologação

- aplicação real das migrations e RLS em Supabase;
- redução adicional de usos legados de service role;
- eliminação progressiva dos usos de `any`;
- testes E2E, carga, storage e backup/restauração;
- MFA e observabilidade dependem da infraestrutura de destino;
- fila offline completa ainda não foi liberada.
