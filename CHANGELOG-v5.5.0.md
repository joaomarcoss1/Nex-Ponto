# Changelog NexPonto v5.5.0

## Production hardening

- adicionada migration `055_nexponto_v55_admin_rbac_operations.sql`;
- adicionados RPCs transacionais para ciclo de vida de administradores;
- adicionada reconciliacao auditavel entre administradores e memberships;
- adicionada matriz compartilhada de permissoes administrativas;
- integrado filtro de menu administrativo a mesma matriz das APIs;
- adicionado helper de paginacao por lote para relatorios;
- bloqueada URL assinada de anexo enquanto a varredura nao estiver limpa;
- adicionado rate limit distribuido na API publica de dispositivo;
- reforcado contrato HTTP com header `x-request-id`;
- adicionados indices operacionais e funcao de limpeza de dados efemeros;
- ajustada experiencia mobile da tela inicial de ponto para evitar sobreposicao com a navegacao inferior;
- incluido script `structure:v55`;
- atualizados README, auditoria e evidencias de validacao.
