# Capacidade de infraestrutura

Dimensionamento inicial do piloto: 20 tenants, picos concentrados na entrada,
intervalo e saída. APIs web permanecem stateless; PostgreSQL é a fonte canônica;
exports grandes usam `background_jobs` com `SKIP LOCKED`, lease, retry exponencial
e dead-letter; storage guarda artefatos temporários.

Metas propostas para homologação: p95 do ponto abaixo de 1,5 s, erro abaixo de
0,5%, disponibilidade mensal de 99,9%, fila sem trabalho vencido por mais de
5 minutos e restauração dentro do RTO/RPO contratado.

Não dimensionar apenas por média diária. O teste deve simular rajadas por tenant,
NSR concorrente, geofence, rate limit e falha parcial de storage. Resultado real
deve ser anexado a `performance-test-results.md` antes do go-live.
