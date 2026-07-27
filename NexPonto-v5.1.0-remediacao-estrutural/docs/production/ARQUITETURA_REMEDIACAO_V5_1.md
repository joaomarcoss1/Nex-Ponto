# Arquitetura da remediação NexPonto v5.1

## Objetivo

A v5.1 corrige os bloqueadores de banco de horas, histórico de jornada, fechamento financeiro, RLS, escalas e mobile sem apagar dados existentes.

## Fonte única por domínio

- **Jornada:** `work_sessions.schedule_snapshot`, com checksum e marcações carregadas por `work_session_id`.
- **Banco de horas:** `hour_bank_movements`, com minutos sempre positivos e sinal definido por `movement_type`.
- **Pré-folha:** `payroll_calculation_runs` + `payroll_item_rubrics` + `payroll_divergences`.
- **Escala:** ocorrência publicada → ciclo vigente → modelo contratual → divergência.
- **Relatórios:** somente o run profissional vigente.

## Camadas

1. captura de ponto;
2. sessão e snapshot histórico;
3. apuração da jornada;
4. horas extras aprovadas;
5. ledger de banco de horas;
6. regras contratuais segmentadas;
7. rubricas e encargos homologados;
8. divergências;
9. aprovações segregadas;
10. fechamento e exportação.

## Segurança

As tabelas financeiras permitem `SELECT` somente com permissão financeira. Escritas diretas de `authenticated` foram revogadas e ocorrem por RPCs transacionais validadas pelo backend. `service_role` permanece restrita a RPCs, jobs e rotas internas que validam tenant, membership e filial.

## Legado

O endpoint antigo de folha permanece somente leitura para consulta histórica. Novas gerações utilizam exclusivamente `/api/admin/payroll/professional`.
