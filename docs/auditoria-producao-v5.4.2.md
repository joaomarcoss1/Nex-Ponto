# NexPonto v5.4.2 - Auditoria Completa para Produção Profissional

Data: 2026-08-16

## Resposta Direta

O sistema não deve travar por falhas já identificadas no pacote local: build, lint, typecheck, testes unitários, E2E, migrations e verificações estruturais passaram.

Ele permite criar:

- empresa inicial pelo fluxo `/admin/configuracao-inicial`, usando `/api/admin/bootstrap-master`;
- empresas adicionais pelo painel `/platform`, usando `/api/platform/tenants`;
- administradores pelo painel `/admin/administradores`, usando `/api/admin/admins`;
- funcionários pelo painel `/admin/funcionarios`, usando `/api/admin/employees`;
- filiais, horários, escalas, ponto, justificativas, banco de horas, pré-folha e relatórios pelas rotas administrativas existentes.

Mas ele só roda completo conectado ao banco quando `.env.local` estiver preenchido com Supabase real, secrets fortes e migrations aplicadas. Sem isso, as telas abrem no VSCode, mas as operações de banco retornam erro operacional amigável.

## Fluxo de Criação de Empresa

### Empresa inicial

Arquivos auditados:

- `src/app/admin/configuracao-inicial/page.tsx`
- `src/app/api/admin/bootstrap-master/route.ts`

O fluxo:

1. lê `MASTER_ADMIN_EMAIL`, `MASTER_SETUP_TOKEN`, `MASTER_TENANT_NAME`, `MASTER_TENANT_SLUG` e timezone;
2. impede bootstrap se já existir owner/master ativo;
3. cria ou atualiza usuário no Supabase Auth;
4. chama `bootstrap_tenant_owner_v4`;
5. cria empresa e proprietário em operação atômica;
6. desfaz usuário Auth recém-criado se a criação transacional falhar.

Condição para funcionar: migrations aplicadas e service role configurada.

### Empresas adicionais

Arquivos auditados:

- `src/app/platform/page.tsx`
- `src/app/api/platform/tenants/route.ts`
- `src/lib/contracts/tenant-onboarding.ts`

O fluxo:

1. exige superadmin da plataforma;
2. valida payload de tenant;
3. exige `Idempotency-Key`;
4. cria ou vincula usuário owner no Supabase Auth;
5. chama `create_tenant_with_owner_v4`;
6. registra estado idempotente;
7. envia recuperação/convite de senha;
8. faz rollback do Auth se falhar antes de criar o tenant.

Condição para funcionar: usuário logado com permissão de plataforma e SMTP/Auth redirect configurado.

## Fluxo de Administradores

Arquivos auditados:

- `src/app/admin/administradores/page.tsx`
- `src/app/api/admin/admins/route.ts`
- `src/lib/validation/schemas.ts`

O fluxo:

- valida e-mail, nome, role, filial principal e filiais permitidas;
- cria usuário no Supabase Auth quando senha inicial é informada;
- vincula `auth_user_id` ao registro em `admin_users`;
- impede auto-rebaixamento e desativação do último master;
- exige permissão `administrators.manage`;
- audita criação, atualização e desativação.

Condição para funcionar: admin autenticado, tenant selecionado e permissões corretas.

## Fluxo de Funcionários

Arquivos auditados:

- `src/app/admin/funcionarios/page.tsx`
- `src/app/api/admin/employees/route.ts`
- `src/lib/server/pin.ts`

O fluxo:

- valida nome, matrícula, documento, telefone, cargo, setor, filial, salário, PIN, jornada e almoço;
- exige PIN inicial de quatro dígitos na criação;
- valida filial dentro do escopo do admin;
- aplica limite de funcionários do plano;
- salva via RPC transacional `upsert_employee_v4`;
- gera hash seguro do PIN;
- mascara campos sensíveis quando o usuário não pode ver dados financeiros.

Condição para funcionar: pelo menos uma filial ativa criada e migrations aplicadas.

## Botões e Funções Críticas

Área pública:

- buscar funcionário;
- limpar busca;
- PIN de quatro dígitos;
- selecionar filial;
- testar GPS;
- continuar registro de ponto;
- acessar área administrativa.

Admin:

- criar/editar/desativar funcionários;
- importar/exportar funcionários;
- criar/editar/desativar filiais;
- gerar QR de filial;
- validar GPS de filial;
- criar/editar administradores;
- revisar pontos, justificativas e inconsistências;
- banco de horas;
- pré-folha;
- relatórios;
- configurações e segurança.

Todos os fluxos críticos passam por APIs com autenticação, permissões, escopo por tenant/filial e contrato de erro sanitizado.

## Design

Pontos positivos:

- identidade visual consistente;
- tela pública focada em uso mobile;
- botões grandes nos fluxos de campo;
- administração densa, com navegação por módulos;
- mensagens de erro agora são operacionais, não técnicas;
- marca azul institucional protegida.

Pontos recomendados para próxima rodada:

- testar em celulares reais com teclado aberto;
- revisar páginas muito densas de folha/relatórios em telas pequenas;
- ampliar tooltips nos botões administrativos menos óbvios;
- executar teste de contraste com dados reais e logo final do cliente.

## Melhorias Aplicadas nesta Rodada

- Versão elevada para `5.4.2`.
- Adicionado `npm run doctor`.
- `npm run verify` agora inclui diagnóstico estrutural do pacote.
- `npm run verify:production` também inclui o diagnóstico após validação de ambiente.
- README atualizado com fluxo VSCode.
- Novo relatório de auditoria de produção.

## O Que Ainda Pode Dar Erro

Esses erros não são de código local, mas de implantação:

- `.env.local` ausente ou com secrets curtos;
- Supabase URL/anon/service role incorretos;
- migrations não aplicadas;
- usuário sem permissão de master/admin/plataforma;
- filial não criada antes de cadastrar funcionário;
- Google Maps sem chave, caso queira mapa interativo;
- APP_URL em HTTP/localhost no ambiente de produção;
- SMTP/Auth redirect não homologado para envio de convite.

## Comando de Liberação

Para validar o pacote localmente no VSCode:

```bash
npm ci
cp .env.example .env.local
npm run doctor
npm run dev
```

Para validar antes de produção, com `.env` real:

```bash
npm run verify:production
```

Se `verify:production` passar com banco real, o pacote fica apto para implantação profissional.
