# Auditoria conservadora de código morto

Comando: `npm run audit:dead-code`.

## Resultado

- nenhum arquivo foi removido nesta remediação;
- migrations históricas, rotas App Router, middleware, assets, PWA, relatórios, folha, auditoria e RPCs foram classificados como `NÃO REMOVER SEM HOMOLOGAÇÃO`;
- componentes/serviços apontados pelo scanner por nome foram mantidos porque há referências por alias, testes, convenções do framework ou chamadas dinâmicas;
- dependências do `package.json` não foram removidas sem prova completa de build/runtime.

## Rollback

Não se aplica a remoções, pois não houve exclusão. Uma futura limpeza deve ocorrer separadamente, pesquisar imports estáticos/dinâmicos, rotas, SQL, jobs e consumidores externos, e executar a suíte inteira antes e depois.
