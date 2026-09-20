# NexPonto v5.5.2

## Estabilidade e segurança

- Login administrativo por e-mail e senha, sem challenge adicional para master, admins ou suporte.
- Estado administrativo recuperável: falhas 5xx, timeout e indisponibilidade não encerram a sessão.
- Endpoint de login com rate limit distribuído por conta e IP e auditoria somente por hashes.
- Diagnóstico explícito de sessão, membership, perfil, tenant, banco e ambiente.
- Readiness com checks independentes de Auth, banco, storage, migrations e RPCs críticas.

## Dados e operações

- Cadastro de funcionário idempotente após timeout, sem duplicar funcionário, salário ou escala.
- Criação de empresa preserva o usuário Auth em falha parcial e reutiliza a mesma chave de tentativa.
- Reconciliação administrativa conservadora e auditável entre Auth, admin_users e memberships.
- API canônica `has_tenant_permission(uuid,text)` com compatibilidade para policies v5.4.
- Paginação completa em funcionários, escalas, horas extras e pré-folha.
- Fuso padrão alterado para `America/Fortaleza`, preservando configurações existentes.

## Plataforma

- Cache PWA v5.5.2 sem páginas administrativas, platform ou APIs autenticadas.
- CI endurecido com migrations, estruturas, integração obrigatória, audit, build e E2E.
- Precheck, postcheck, doctor online e checklist de produção adicionados.
