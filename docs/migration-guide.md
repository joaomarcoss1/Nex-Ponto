# Guia de migração v5.1 → v5.2

## Novas migrations

- 045: linha canônica de branding, correção seletiva do verde legado, assets, suporte e auditoria;
- 046: hora extra com valor manual opcional e split seguro;
- 047: classificação/efeito de ausências e metadados seguros de anexos;
- 048: idempotência de operações de plataforma.

Não há `DROP TABLE`, `TRUNCATE`, reset ou exclusão em massa.

## Rollback

- fazer rollback da aplicação para v5.1;
- manter as novas colunas/tabelas, pois são retrocompatíveis;
- desabilitar endpoints v5.2 no roteamento;
- revogar sessões de suporte ativas;
- restaurar backup apenas se houver corrupção comprovada;
- não apagar migrations já aplicadas.

A reversão de dados de branding deve ser feita por migration corretiva específica, nunca editando a 045.

