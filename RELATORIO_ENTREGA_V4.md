# Relatório de entrega — NexPonto v4.0.0

**Versão:** 4.0.0  
**Classificação:** Production Candidate / homologação técnica  
**Foco:** remediação multiempresa, integridade operacional e mobile premium

## Resumo executivo

A v4 corrige a principal falha da v3: a fundação multiempresa criada no banco sem propagação consistente para APIs, rotas públicas, auditoria, PIN e operações críticas. Foram adicionadas migrations corretivas, contexto explícito de tenant, isolamento defensivo, RPCs transacionais e portais distintos para plataforma, administração e funcionários.

A experiência mobile foi reorganizada para uso diário, com navegação inferior de cinco destinos para funcionários, dashboard operacional para gerentes, cards adaptativos e planejador semanal utilizável em telas pequenas.

Esta entrega **não deve ser chamada de produção homologada ainda**. A instalação das dependências foi bloqueada por erro 503 do gateway de pacotes deste ambiente; também não havia Supabase/PostgreSQL real disponível. Consequentemente, lint, typecheck completo, Vitest, build, RLS real, E2E, carga e backup/restauração ainda precisam ser executados no ambiente de homologação.

## Implementações estruturais

### SaaS e isolamento

- tenant ativo selecionado explicitamente por cookie HTTP-only assinado;
- memberships e escopo de filiais;
- cliente defensivo para chamadas legadas com service role;
- resolução pública por domínio verificado ou código opaco da empresa;
- rotas públicas de filial, funcionário, ponto, QR, histórico, GPS e portal tenantizadas;
- policies antigas consolidadas pela migration 021;
- chaves únicas compatíveis com tenants;
- portal da plataforma e criação atômica de nova empresa/proprietário;
- onboarding, planos, limites, branding, domínios e feature flags;
- link público do portal usando `public_access_code`, sem confiar em slug livre.

### Segurança

- auditoria tenantizada, sanitizada e com hash de IP;
- PIN fail-closed;
- rate limit compartilhado no PostgreSQL;
- QR armazenado por hash, com expiração e revogação;
- diagnóstico público de GPS somente leitura;
- validação presencial de GPS por sessão autorizada;
- segredo dedicado para jobs internos;
- scanner de marca legada, CPF, tokens e segredos;
- ponto offline desabilitado explicitamente até homologação.

### Jornada e ponto

- `work_sessions` e eventos de jornada;
- múltiplos intervalos repetíveis;
- base para turno atravessando meia-noite;
- ponto transacional e idempotente;
- evidência imutável da tentativa antes da justificativa;
- timezone da filial nas operações públicas;
- horário de funcionamento considerado no ponto;
- marcação manual administrativa por RPC transacional;
- remoção da unicidade antiga incompatível com múltiplos intervalos.

### RH e operação

- cadastro atômico de funcionário;
- modelos de turno com intervalos;
- planejador semanal responsivo;
- publicações e ocorrências de escala;
- banco de horas como ledger com estorno;
- solicitações pelo portal do funcionário;
- fluxo de aprovação e aplicação;
- job explícito para decisões de feriados, sem mutação em GET;
- painel do gerente alinhado ao contrato da API.

### Pré-folha e relatórios

- linguagem padronizada como “Pré-folha e conferência de jornada”;
- branding do tenant em PDF/XLSX;
- GPS diferenciado entre dentro, fora, sem GPS e precisão insuficiente;
- correções de filtros e deduplicação já aplicadas na base;
- competências fechadas protegidas em operações v4 críticas.

### Mobile

- portal do funcionário: Início, Ponto, Escala, Solicitações e Perfil;
- sessão do funcionário sem persistir PIN;
- barra inferior com safe-area;
- ação principal de ponto e prevenção de duplicidade;
- cards de escala e linha de status de solicitações;
- administração mobile com cards, atalhos e filtros adaptados;
- planejador semanal com abas por dia em telas pequenas;
- mensagens claras para conexão e sincronização.

## Migrations v4

1. `021_nexponto_v4_tenancy_security_and_operations.sql`
2. `022_nexponto_v4_clock_transactions.sql`
3. `023_nexponto_v4_operational_transactions.sql`
4. `024_nexponto_v4_employee_portal_and_requests.sql`
5. `025_nexponto_v4_schedule_planner.sql`
6. `026_nexponto_v4_employee_atomic_upsert.sql`
7. `027_nexponto_v4_manual_time_entry_and_multi_breaks.sql`
8. `028_nexponto_v4_bootstrap_tenant_owner.sql`
9. `029_nexponto_v4_offline_feature_guard.sql`
10. `030_nexponto_v4_platform_tenant_atomic_create.sql`

As migrations devem ser aplicadas e testadas em banco real. A verificação executada nesta entrega é estática e estrutural.

## Verificações executadas

| Verificação | Resultado |
|---|---|
| `npm run security:data` | Aprovado |
| `npm run migrations:check` | Aprovado — 30 migrations sequenciais |
| `npm run structure:check` | Aprovado |
| Parser TypeScript/JavaScript | 190 arquivos sem erro sintático |
| Resolução de imports locais | 188 arquivos resolvidos |
| `npm ci` | Não concluído — gateway retornou HTTP 503 ao baixar `zod` |
| `npm run lint` | Não executado — dependências não instaladas (`eslint` ausente) |
| `npm run typecheck` | Não executado completamente — tipos Node/React ausentes após falha da instalação |
| `npm run test` | Não executado — `vitest` ausente |
| `npm run build` | Não executado — `next` ausente |
| Migrations em Supabase real | Pendente |
| Teste RLS com dois tenants | Pendente |
| E2E e carga | Pendente |
| Backup/restauração real | Pendente |

## Pendências técnicas conhecidas

- reproduzir instalação, lint, typecheck, testes e build em CI com acesso ao registro npm;
- aplicar todas as migrations do zero e em upgrade v2/v3;
- validar SQL/RPCs em PostgreSQL real;
- testar RLS e storage com dois tenants;
- concluir redução progressiva dos usos legados de `any` e supressões;
- homologar MFA, monitoramento, SMTP, cron/worker e política de backup;
- implementar fila offline completa antes de habilitar o recurso;
- executar testes E2E, concorrência e performance;
- revisar todas as operações antigas que ainda usam o adaptador de service role;
- validar acessibilidade em aparelhos e leitores de tela reais.

## Pendências externas

### Contábeis e trabalhistas

- regras de adicionais, banco de horas, atrasos, feriados e convenções;
- comparação da pré-folha com o sistema oficial por duas competências;
- decisão sobre requisitos de REP/Portaria 671 e eSocial.

### Jurídicas e privacidade

- bases legais e retenção de GPS/documentos;
- termos, política de privacidade e resposta a incidentes;
- suporte temporário e contratos com operadores.

### Operacionais

- validação presencial de todas as filiais;
- treinamento de gestores e funcionários;
- piloto controlado com pelo menos duas empresas;
- rotina de suporte, contingência e fechamento.

## Publicação recomendada

1. criar projeto Supabase de homologação;
2. restaurar uma cópia sanitizada da versão atual;
3. aplicar as 30 migrations;
4. executar `npm ci` e `npm run verify`;
5. criar dois tenants com códigos e matrículas iguais;
6. executar testes RLS, APIs públicas, storage e exportações;
7. executar E2E mobile/desktop;
8. testar backup e restauração;
9. configurar SMTP, domínio, Auth redirects, jobs e monitoramento;
10. realizar piloto com duas empresas;
11. homologar pré-folha;
12. promover para produção somente após aprovação do checklist.

## Conclusão

O pacote representa uma evolução estrutural real e muito superior à v3, especialmente em tenancy, operações transacionais e mobile. Entretanto, “implementado” não equivale a “produção homologada”. A classificação correta desta entrega é **NexPonto v4.0.0 Production Candidate — Mobile Premium**, pronta para a etapa de homologação técnica em infraestrutura real.
