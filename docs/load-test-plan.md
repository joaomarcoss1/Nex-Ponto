# Plano de Teste de Carga

## Cenario principal

Endpoint: `/api/public/clock/register`.

Cobertura: PIN, bcrypt, tenant, filial, dispositivo, GPS, geofence, idempotencia, NSR, comprovante, sessao e auditoria.

## Script

`npm run test:load:clock`

Variaveis: `LOAD_TEST_BASE_URL`, `LOAD_TEST_TENANT_CODE`, `LOAD_TEST_EMPLOYEE_IDS`, `LOAD_TEST_PIN`, `LOAD_TEST_TOTAL_CLOCKS`, `LOAD_TEST_CONCURRENCY`.

## Metas iniciais

p95 abaixo de 2s, erro abaixo de 0,5%, nenhum NSR duplicado, nenhuma mistura de tenant e nenhum job perdido.

