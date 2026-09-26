# Arquitetura multiempresa — NexPonto v3.0

## Modelo

A versão 3 introduz tenancy compartilhada por `tenant_id`. A instalação v2 é migrada para o tenant `tenant-principal`, preservando dados e chaves existentes. Novos clientes devem ser criados pelo portal de plataforma e receber domínio, plano, branding e memberships próprios.

## Limites de confiança

- O tenant autenticado é obtido da membership ligada a `auth.uid()`; não é aceito livremente do corpo da requisição.
- Endpoints públicos resolvem o tenant por domínio verificado ou cabeçalho interno controlado.
- RLS filtra `tenant_id = current_tenant_id()`.
- Funções `SECURITY DEFINER` usam `search_path=public` e devem validar tenant internamente.
- `service_role` fica reservada para setup, jobs, migrações e RPCs explicitamente auditadas.

## Migração v2 → v3

1. Fazer backup do banco e Storage.
2. Aplicar migrations 001–020 em homologação.
3. Confirmar que todas as linhas possuem `tenant_id`.
4. Criar membership para cada administrador.
5. Testar duas empresas com usuários, filiais e funcionários distintos.
6. Executar testes de acesso cruzado antes de produção.

## Regras para novas tabelas

Toda tabela operacional deve ter `tenant_id NOT NULL`, FK para `tenants`, índice iniciado por tenant e RLS. Entidades ligadas a filial ou funcionário devem validar que o pai pertence ao mesmo tenant.
