# Auditoria do banco e migrations

## Estado do pacote

- 54 migrations sequenciais, `001` a `054`;
- migrations históricas preservadas sem edição;
- `053_nexponto_v54_structural_remediation.sql`: compatibilidade de feature flags, convite, onboarding, permissões, grants, RLS financeiro, Storage por tenant, schema version e RPC de inventário;
- `054_nexponto_v54_branch_atomic_save.sql`: gravação atômica de filial e funcionamento;
- verificação estática `npm run migrations:check`: aprovada.

## Coluna canônica

`tenant_features.configuration` é canônica. `config` permanece temporariamente para bases antigas e é sincronizada por trigger, sem renomear, apagar ou perder JSON existente.

## Auditoria real

Execute após aplicar as migrations em uma cópia do banco:

```bash
npm run audit:database
```

O script usa a RPC somente leitura `audit_database_structure_v54`, restrita à `service_role`, e classifica tabelas, funções, policies, buckets, colunas, RLS e versão como `OK`, `AUSENTE`, `INCOMPATÍVEL`, `LEGADO`, `REQUER MIGRATION` ou `BLOQUEADOR`. Sem URL/service role real, o comando encerra com código 2 e não simula sucesso.

## Validações obrigatórias ainda externas

- aplicar 001–054 em banco limpo;
- aplicar somente 053–054 em clone atualizado com dados;
- testar criação com e-mail novo e usuário Auth existente;
- executar teste RLS com dois tenants;
- validar policies do Storage e links assinados;
- comparar contagens/checksums antes/depois e executar restore ensaiado.
