# Plano de rollback

As migrations 053/054 são aditivas. Não execute `DROP`, `TRUNCATE` ou rollback destrutivo em produção.

## Aplicação

1. registrar versão, horário, contagens e checksums;
2. manter backup PostgreSQL/Storage confirmado;
3. aplicar em homologação e depois produção;
4. observar pelo menos criação de tenant, filial/horários e ponto.

## Se o aplicativo falhar

Reimplante a versão web anterior. As colunas, triggers e RPCs novas são compatíveis e podem permanecer sem uso. Não remova `configuration`, `config` ou estados de convite.

## Se houver falha de dados/schema

Bloqueie novas escritas, preserve logs/requestIds, compare o clone pré-deploy e restaure o snapshot para um projeto separado. Promova o restore somente após validação. A decisão de remover policies/RPCs novas deve ser uma migration corretiva posterior, revisada; nunca edite 053/054 já aplicadas.

## Critério de retorno

Health/readiness, Auth, isolamento de dois tenants, contagens, ponto idempotente e pré-folha de amostra devem coincidir antes de reabrir o tráfego.
