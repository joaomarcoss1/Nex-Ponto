# Resultado de desempenho

Status: **pendente de ambiente de homologação equivalente à produção**.

O build e os testes locais validam código, não capacidade. Para aprovar, registrar:
data/commit, topologia, região, banco, volume, concorrência, duração, p50/p95/p99,
taxa de erro, CPU/memória, conexões, locks, fila e custo.

Cenários obrigatórios: 20 tenants; rajada simultânea de ponto; dupla submissão
idempotente; NSR concorrente; consulta de jornada; cálculo de competência;
exportação em fila; indisponibilidade do storage; retry/dead-letter.

Critério inicial: nenhum NSR duplicado, nenhum dado cruzado, zero perda de
marcação e p95 do ponto < 1,5 s. Este documento não declara teste aprovado até
receber evidência real.
