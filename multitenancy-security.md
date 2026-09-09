# Segurança multitenant

## Regras

1. `tenant_id` do frontend nunca é fonte de autorização.
2. Admin deriva tenant da membership assinada ou sessão de suporte válida.
3. Público deriva tenant de host verificado, código, slug validado ou cookie contextual.
4. O proxy de Supabase injeta/fixa tenant em tabelas de domínio.
5. RPCs recebem tenant validado e verificam IDs.
6. Relatórios, storage e downloads devem usar tenant e permissão.

## Matriz RLS mínima

| Ator | Tenant próprio | Outro tenant | Suporte válido |
|---|---:|---:|---:|
| Owner A | permitido conforme permissão | bloqueado | n/a |
| Admin A | permitido conforme filial | bloqueado | n/a |
| Funcionário A | somente dados pessoais | bloqueado | n/a |
| Master sem sessão | plataforma | bloqueado | não |
| Master com sessão ativa | tenant de destino | demais bloqueados | sim |
| Master com sessão expirada | bloqueado | bloqueado | não |

O teste real exige `TEST_SUPABASE_*` em um projeto de homologação. Sem essas credenciais, a suíte registra os casos como ignorados e não constitui evidência de produção.

