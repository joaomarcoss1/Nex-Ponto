# Runbook de Observabilidade

## Eventos minimos

Login, MFA, PIN, bloqueios, ponto, NSR, QR replay, GPS, RLS negada, acesso cruzado, Storage, filas, dead-letter, relatorios, exportacoes, banco, backup, sessao Master e alteracoes de permissao.

## Implementacao

`src/lib/observability/logger.ts` emite logs JSON sanitizados com ambiente, versao, evento e detalhes. `captureException` padroniza excecoes sem vazar PIN, senha, token, CPF, documento ou dados bancarios.

## Alertas

Configurar no fornecedor: aumento de erro, latencia, NSR duplicado, ponto perdido, dead-letter, falha de worker, falha de Storage, falha de backup, exportacao em massa, excesso de PIN e tentativa entre tenants.

