# Relatório de Remediação v5.5.6

## Correções aplicadas

- Removido fallback de `TEST_SUPABASE_*` em produção.
- Bootstrap de owner/superadmin regravado para `mfa_required=false`.
- API de administradores passou a usar `upsert_tenant_admin_v556` para gravar perfil, membership e auditoria de forma transacional.
- Autorização administrativa passou a rejeitar mismatch de role/filiais entre `admin_users` e `tenant_memberships`.
- Registro de ponto passou a validar recibo antes do commit e a não retornar falso erro quando o commit já ocorreu.
- Duplicidade concorrente de idempotência no ponto retorna o registro existente.
- Jobs internos migrados para claim/heartbeat/complete/fail v5.5.6 com `lease_token`.
- Readiness expandido para secrets críticos, versão 5.5.6 e RPCs novas.
- Paginação removendo limites fixos em ponto e geo-report.
- AdminShell corrigido para rotas reais, menu mobile acessível e sem revalidação integral em toda navegação.
- PWA cache atualizado para v5.5.6.

## Limites da validação local

Validações reais de login, RLS, storage, workers externos, carga e dados vivos dependem de Supabase e credenciais de produção/homologação. O pacote contém prechecks e doctor para executar esses passos no ambiente real.
