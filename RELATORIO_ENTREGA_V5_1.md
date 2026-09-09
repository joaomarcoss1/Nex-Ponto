# Relatório de entrega — NexPonto v5.1.0

## Resumo executivo

A versão v5.1 aplica a remediação estrutural solicitada sobre a base NexPonto disponível, priorizando banco de horas, histórico de jornada, pré-folha profissional, segurança RLS, escalas, relatórios, experiência mobile e verificações de qualidade.

O pacote está preparado para ser aberto no VS Code e seguir para homologação. Ele **não deve ser considerado produção certificada** antes da aplicação em PostgreSQL/Supabase real, execução integral de lint/typecheck/test/build, testes RLS/E2E/carga e comprovação de backup/restauração.

## Correções aplicadas

### Banco de horas

- convenção única: `minutes` positivo e `movement_type` define o sinal;
- normalização incremental dos movimentos legados;
- constraint contra minutos negativos;
- saldo anterior e posterior;
- idempotência e advisory lock;
- lançamento e estorno por RPC transacional;
- bloqueio em competência fechada;
- integração correta à memória da pré-folha;
- testes para crédito, débito e saldo.

### Jornada histórica e virada de competência

- snapshots normalizados e protegidos por checksum;
- snapshot da sessão usado como fonte histórica prioritária;
- divergência crítica quando não existe fonte histórica confiável;
- marcações carregadas por `work_session_id`;
- suporte ao encerramento da jornada no mês seguinte;
- apuração de múltiplos intervalos e sessões incompletas.

### Pré-folha profissional

- runs versionados;
- rubricas detalhadas;
- divergências auditáveis;
- resolução e aceitação formal de exceções;
- contratos e regras segmentados por vigência;
- seleção determinística de tabelas legais;
- valor aprovado de hora extra aplicado ao cálculo;
- split entre pagamento e banco de horas;
- resultado transacional;
- aprovações de RH e financeiro segregadas;
- fechamento com hash;
- motor legado bloqueado para novas gravações.

### Escalas e cobertura

- ciclos 5x2, 6x1, 12x36, semana A/B, rodízio e personalizado;
- atribuição por vigência;
- requisitos de cobertura;
- validação de déficit, excesso e conflitos;
- política de bloqueio, justificativa ou alerta;
- publicação transacional;
- telas desktop e mobile específicas.

### Segurança e RLS

- policies financeiras separadas por operação;
- ausência de `FOR ALL` nas policies financeiras novas;
- escrita direta revogada para tabelas de resultado;
- RPCs críticas com tenant explícito;
- permissões distintas para visualizar, editar, banco de horas e exportação;
- auditoria em operações críticas;
- zero ocorrência de `any` nos motores e rotas críticas v5.1 analisados.

### Relatórios e exportações

- PDF/XLSX a partir do run profissional vigente;
- valores agregados com precisão monetária no servidor;
- idempotência e checksum;
- fila de exportações e progresso;
- autorização financeira específica;
- motor legado excluído como fonte de novas exportações profissionais.

### Mobile Premium

- pré-folha em cards para telas pequenas;
- memória de cálculo por funcionário;
- divergências e aprovações adaptadas;
- planejador de escalas por dia;
- filtros e ações organizadas;
- áreas seguras e prevenção de sobreposição;
- guia de breakpoints e acessibilidade.

## Migrations incrementais

Foram preservadas as migrations existentes e adicionadas as migrations `031` a `044`:

1. `031_nexponto_v51_hour_bank_sign_normalization.sql`
2. `032_nexponto_v51_historical_journey_snapshots.sql`
3. `033_nexponto_v51_contract_legal_rule_versioning.sql`
4. `034_nexponto_v51_professional_payroll_core.sql`
5. `035_nexponto_v51_financial_rls_hardening.sql`
6. `036_nexponto_v51_schedule_cycles_coverage.sql`
7. `037_nexponto_v51_reports_jobs_legacy_guard.sql`
8. `038_nexponto_v51_integrity_precheck_postcheck.sql`
9. `039_nexponto_v51_payroll_result_transactions.sql`
10. `040_nexponto_v51_overtime_approval_destination.sql`
11. `041_nexponto_v51_schedule_transactional_publish.sql`
12. `042_nexponto_v51_new_tables_rls_and_integrity.sql`
13. `043_nexponto_v51_session_snapshot_attendance_hardening.sql`
14. `044_nexponto_v51_divergence_resolution_and_approval_segregation.sql`

A ordem não deve ser alterada. Antes da aplicação, executar backup e `scripts/sql/precheck-v51.sql`. Depois, executar `scripts/sql/postcheck-v51.sql`.

## Inventário atual

- versão: `5.1.0`;
- 44 migrations sequenciais;
- 68 arquivos de rotas de API;
- 40 páginas;
- 208 arquivos TypeScript/TSX em `src`;
- 11 arquivos de teste;
- 35 casos de teste declarados;
- 1.238 linhas nas migrations v5.1;
- zero `any` no conjunto crítico v5.1 verificado;
- dívida técnica legada remanescente: aproximadamente 367 ocorrências de `any` e 10 supressões fora do núcleo crítico.

## Verificações executadas

| Comando/verificação | Resultado | Ambiente |
|---|---|---|
| `npm run security:data` | Aprovado | análise local |
| `npm run migrations:check` | Aprovado — 44 migrations | análise estática |
| `npm run structure:check` | Aprovado | análise local |
| `npm run structure:v51` | Aprovado — 14 verificações | análise local |
| parser TypeScript isolado | Aprovado — 210 arquivos | TypeScript global |
| resolução de imports locais | Aprovado — 219 arquivos | análise local |
| typecheck estrito dos serviços críticos | Aprovado — 6 serviços | TypeScript global |
| smoke executável v5.1 | Aprovado | JavaScript compilado |

O smoke executável validou:

- crédito e débito do banco de horas;
- sessão atravessando competência;
- ciclo 12x36;
- bloqueio de cobertura;
- hora extra com salário e divisor vigentes na data.

## Verificações não certificadas neste ambiente

A instalação `npm ci` não terminou dentro de 180 segundos no ambiente disponível. Como consequência, não foram certificados aqui:

- ESLint completo;
- typecheck integral do projeto;
- execução da suíte Vitest pelo runner oficial;
- build Next.js;
- aplicação das migrations em PostgreSQL/Supabase real;
- testes RLS com dois tenants;
- E2E em navegador;
- carga e concorrência;
- backup e restauração reais;
- validação visual de PDF/XLSX em grande volume.

## Prontidão real

**Código:** candidato robusto para homologação.  
**VS Code:** pacote preparado e limpo.  
**Produção certificada:** pendente das validações externas listadas acima.  
**Folha oficial:** pendente de homologação contábil, trabalhista e de convenções coletivas.

## Roteiro obrigatório de publicação

1. restaurar uma cópia sanitizada do banco atual;
2. executar precheck;
3. aplicar as migrations `031`–`044`;
4. executar postcheck;
5. validar saldos do banco de horas;
6. testar duas empresas com matrículas e códigos iguais;
7. executar lint, typecheck, testes e build;
8. executar RLS, E2E, segurança e carga;
9. gerar PDF/XLSX de 1, 100 e 1.000 funcionários;
10. realizar backup e restauração;
11. rodar duas competências em simulação paralela;
12. obter homologação de RH e contabilidade;
13. liberar gradualmente.
