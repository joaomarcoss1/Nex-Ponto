# Guia de migração NexPonto v5.1

## Ordem

1. gerar backup do banco e storage;
2. executar `scripts/sql/precheck-v51.sql`;
3. guardar o resultado e checksum;
4. aplicar migrations 031–044 na ordem;
5. executar `scripts/sql/postcheck-v51.sql`;
6. comparar métricas por tenant;
7. executar testes de RLS;
8. calcular uma competência em modo paralelo;
9. comparar com a folha vigente;
10. somente depois ativar o motor profissional para homologação.

## Mudanças principais

- normalização do sinal do banco de horas;
- snapshot autocontido e com checksum;
- contratos e tabelas legais versionadas;
- runs de cálculo profissionais;
- RLS financeira de leitura separada da escrita;
- ciclos, cobertura e validação de publicação;
- bloqueio de escrita no motor legado.

## Rollback

Não reverta migrations destrutivamente após uso. Restaure o backup em um projeto separado e faça corte controlado. As migrations novas preservam dados legados; o rollback funcional recomendado é desativar as features v5.1 e manter o legado apenas para consulta.
