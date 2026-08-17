# NexPonto v5.4.1 - Análise Completa e Remediação de Produção

Data da análise: 2026-08-16

## Escopo Auditado

- Aplicação Next.js 15 com App Router, React 19, Supabase, Vitest e Playwright.
- 77 rotas de API em `src/app/api`.
- 43 componentes em `src/components`.
- 54 migrations em `supabase/migrations`.
- Fluxos públicos: registro de ponto, busca de funcionário, filial, GPS, PIN, histórico, justificativa e portal mobile.
- Fluxos administrativos: login, sessão, tenant, MFA, funcionários, filiais, horários, escalas, ponto, folha, banco de horas, relatórios, auditoria, segurança e configurações.

## Falhas Encontradas

1. A tela pública podia exibir erro técnico de configuração:
   `RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.`
2. O contrato de erro do servidor não incluía `requestId` no topo do payload e ainda podia deixar detalhes técnicos passarem em respostas 5xx.
3. O cliente aceitava payloads legados `{ error: string }` e exibia a mensagem bruta.
4. O shell administrativo ainda lia `payload.error` diretamente em `/api/admin/me`.
5. A configuração de Supabase no browser tinha fallback local e mensagem técnica.
6. A tela de mapa informava diretamente o nome da variável `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
7. O build do Next emitia warning de raiz por detectar outro lockfile fora do projeto.

## Correções Aplicadas

- Criada sanitização central em `src/lib/server/http.ts`:
  - redige nomes de secrets, salts, tokens, keys e service roles;
  - transforma falhas de configuração em mensagem pública segura;
  - adiciona `requestId` no topo e dentro de `error`;
  - bloqueia mensagens técnicas em respostas 5xx não reconhecidas como mensagens públicas;
  - redige detalhes sensíveis em ambiente não produtivo.
- Refeito `src/lib/client/api-error.ts`:
  - normaliza contratos novos e legados;
  - retorna `ApiClientError` com `code`, `requestId`, `retryable` e `status`;
  - impede vazamento de variáveis sensíveis no front-end.
- Ajustado `src/lib/server/rate-limit.ts` para lançar erro operacional genérico quando a configuração de rate limit estiver inválida.
- Ajustado `src/components/admin/AdminShell.tsx` para usar o normalizador seguro em falhas de sessão administrativa.
- Ajustado `src/lib/client/supabase.ts` para remover fallback local enganoso e mensagem técnica.
- Ajustado `src/components/admin/BranchMapEditor.tsx` para mostrar mensagem funcional, sem expor nome de variável de ambiente.
- Ajustado `next.config.ts` com `outputFileTracingRoot` e `allowedDevOrigins`.
- Versão do pacote elevada para `5.4.1`.
- Adicionados testes de regressão para sanitização de erro no servidor e cliente.

## Análise de Estrutura

O sistema está organizado em camadas claras:

- `src/app`: páginas, layouts e rotas HTTP.
- `src/components`: UI pública e administrativa.
- `src/lib/server`: autenticação, tenancy, auditoria, segurança, rate limit e helpers HTTP.
- `src/lib/client`: clientes de API e Supabase browser.
- `src/lib/services`: regras de jornada, folha, banco de horas, escalas e relatórios.
- `src/lib/security`: antifraude, autorização, dispositivo, comprovante e upload.
- `supabase/migrations`: evolução do banco com controles de RLS, triggers, funções, filas e tenancy.
- `scripts`: verificadores estruturais, ambiente, auditoria de dados e banco.

## Análise de Botões e Funções

- Tela pública:
  - busca de funcionário por matrícula/nome;
  - botão de limpar busca;
  - PIN em quatro campos;
  - seletor de filial;
  - teste de GPS;
  - ação principal de continuidade;
  - link para área administrativa.
- Administração:
  - navegação por perfil/role;
  - login, recuperação e troca de senha;
  - ações de CRUD, importação, exportação, revisão, aprovação e configuração;
  - guardas de tenant, MFA e permissões de filial.
- Os botões auditados usam estados de carregamento/desabilitado em fluxos críticos, e os erros agora passam por contrato seguro.

## Análise de Design

- Identidade visual consistente com azul institucional NexPonto.
- Tela pública responsiva, com foco em uso mobile.
- Componentes com cards compactos, hierarquia clara, botões grandes para operação em campo e feedback visual de erro.
- O design não expõe mais instruções técnicas de infraestrutura ao usuário final.
- Ponto a acompanhar em homologação: validar contraste e densidade em celulares reais usados pelos funcionários, especialmente com teclado virtual aberto.

## Pendências Reais para Produção

O código validado está pronto como candidato de produção, mas a ativação produtiva depende de ambiente real:

- configurar Supabase URL, anon key e service role;
- gerar todos os secrets com no mínimo 32 caracteres;
- aplicar as 54 migrations no banco real;
- executar `npm run verify:production` com `.env` real;
- executar `npm run audit:database` contra o banco real;
- rodar testes de integração RLS com credenciais de tenants de teste.

Sem essas credenciais, a aplicação local responde de forma segura, mas não pode ser declarada como produção final conectada ao banco.
