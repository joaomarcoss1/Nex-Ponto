# Migração NexPonto v3 → v4

## Regra principal

Não aplique apenas a migration 020 e libere a aplicação. As migrations 021–030 são a remediação obrigatória da fundação v3.

## Preparação

1. congelar alterações operacionais;
2. exportar inventário de migrations já aplicadas;
3. gerar backup completo do banco e storage;
4. calcular checksum do backup;
5. restaurar em homologação;
6. executar scanner de dados/segredos no repositório;
7. registrar versão atual e commit.

## Cenário A — migration 020 não aplicada

1. publicar código v4 em ambiente de manutenção, sem tráfego;
2. aplicar 020–030 na mesma janela;
3. executar consultas de integridade;
4. validar memberships, tenant_id e chaves compostas;
5. testar dois tenants;
6. liberar somente após smoke tests.

## Cenário B — migration 020 já aplicada

1. não editar o arquivo 020 no histórico;
2. aplicar 021–030;
3. validar todos os backfills;
4. revisar policies removidas e recriadas;
5. confirmar que inserts legados recebem tenant;
6. testar APIs administrativas e públicas;
7. revisar logs de falhas ocorridas entre 020 e 021.

## Cenário C — instalação v2

Crie um tenant para os dados existentes, vincule os administradores e confirme:

- todas as filiais possuem `tenant_id`;
- todos os funcionários possuem `tenant_id`;
- auditoria, PIN, configurações, relatórios e pré-folha foram preenchidos;
- códigos e matrículas utilizam unicidade por tenant;
- nenhum dado foi duplicado ou perdido.

## Validações SQL mínimas

- nenhuma tabela de negócio com `tenant_id is null`;
- nenhuma membership sem tenant/auth user;
- nenhuma filial ou funcionário apontando para tenant divergente;
- nenhuma policy antiga permissiva nas tabelas consolidadas;
- índices compostos presentes;
- funções SECURITY DEFINER com `search_path` fixo;
- QR em texto claro removido/rotacionado quando necessário.

## Rollback

Migrations de segurança e dados não devem ser revertidas cegamente. Em falha:

1. interromper tráfego;
2. preservar logs e evidências;
3. restaurar backup em novo projeto/banco;
4. reverter o deploy da aplicação;
5. validar integridade;
6. apontar o domínio somente após smoke test.

Documente qualquer correção forward-only executada no banco.
