# NexPonto v5.4.1

## Correções de Produção

- Sanitização central de erros públicos e administrativos.
- Bloqueio de vazamento de nomes de variáveis sensíveis em mensagens de UI.
- Inclusão de `requestId` no contrato de erro para suporte e observabilidade.
- Compatibilidade segura com payloads legados de erro.
- Remoção de fallback local enganoso do Supabase browser client.
- Mensagem segura quando Google Maps não estiver configurado.
- Correção do `outputFileTracingRoot` no build Next.js.
- Configuração de origens locais para Playwright/dev server.

## Testes

- Adicionados testes de regressão para erro público sanitizado.
- Adicionados testes para mensagem 5xx genérica em falhas de infraestrutura.
- Adicionados testes para compatibilidade segura de erro legado no cliente.
