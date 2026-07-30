# Matriz de Acesso por Filial

## Regra

O escopo efetivo de filial vem de `admin_users.branch_id`, `admin_users.allowed_branch_ids`, `tenant_memberships.branch_ids` e `tenant_member_branches`.

## Acesso total

Papeis `tenant_owner`, `tenant_admin`, `master_admin`, `admin_geral`, `admin`, `rh_financeiro` e sessoes de suporte com escopo aprovado podem acessar todas as filiais do tenant, conforme permissao.

## Acesso restrito

Gestores de filial e lideres departamentais so acessam `branch_id` explicitamente autorizado. Consultas server-side usam `scopeByBranch`, `scopeNullableBranchQuery` e validadores como `assertEmployeeInScope`.

## Resultado esperado

Filial A1 nao visualiza, altera, aprova, exporta nem baixa dados restritos a filial A2.

