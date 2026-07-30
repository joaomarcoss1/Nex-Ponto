# Funcoes SECURITY DEFINER

## Inventario estatico

Foram encontradas 67 ocorrencias de `SECURITY DEFINER` nas migrations do pacote analisado.

## Controles adicionados em 053

Novas funcoes:

`safe_uuid_v53`, `active_tenant_member_v53`, `has_permission_v53`, `can_access_branch_v53`, `storage_object_tenant_v53`, `storage_object_entity_type_v53`, `storage_object_entity_id_v53`.

Todas usam `search_path` explicito, validam tenant/membership/empresa ativa/permissao/filial conforme o caso, e nao recebem `EXECUTE` de `anon`.

## Regra operacional

Toda nova funcao interna deve revogar `public`, `anon` e `authenticated` por padrao, concedendo `EXECUTE` apenas quando a funcao for chamada por policy RLS ou por `service_role`.

