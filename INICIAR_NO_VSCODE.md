# NexPonto v5.5.6 - Inicio no VSCode

Extraia o ZIP e abra no VSCode a pasta que contem `package.json`.
Use Node.js 22 e npm 10.

## Instalacao

No terminal PowerShell do VSCode:

```powershell
npm ci
if (!(Test-Path -LiteralPath .env.local)) { Copy-Item -LiteralPath .env.example -Destination .env.local }
```

Preencha `.env.local` com URL e chaves do seu projeto Supabase. Os exemplos
nao sao credenciais funcionais. A chave service role fica somente no servidor.

Para uma instalacao nova, gere um valor independente para cada secret/salt:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Preencha os campos indicados em `.env.example`: contexto da empresa, rate limit,
auditoria, sessao de funcionario, dispositivo, recibo, jobs e configuracao inicial.
Em uma atualizacao, preserve os secrets existentes; sua rotacao precisa ser
planejada porque pode invalidar sessoes e assinaturas.

## Banco e Administrador

1. Faca backup antes de atualizar um banco existente.
2. Aplique as migrations pendentes em ordem ate `059_nexponto_v556_final_auth_production_hardening.sql`.
3. Configure `MASTER_ADMIN_EMAIL`, nome e dados da empresa conforme `.env.example`.
4. Execute `npm run doctor` e `npm run audit:database` com o ambiente real.
5. Inicie com `npm run dev` e abra `http://localhost:3000/admin/login`.

Para uma instalacao nova, use `/admin/configuracao-inicial` com o token de setup
configurado. Remova `MASTER_SETUP_TOKEN` do ambiente depois da ativacao e reinicie.
Em instalacoes existentes, nao recrie o master para contornar um erro de login:
execute `scripts/sql/precheck-master-v56.sql` no SQL Editor do Supabase e confira
Auth user, perfil administrativo, membership ativo e empresa.

## Validacao Para Publicacao

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Na Vercel, configure as mesmas variaveis de servidor, Node 22 e `APP_URL` com
o dominio HTTPS. Configure o redirecionamento de recuperacao de senha no Supabase
para o dominio real. Antes de liberar o uso, execute `npm run verify:production`
com as credenciais de homologacao e valide login, empresas, funcionarios,
administradores, ponto, relatorios, armazenamento e jobs.

`FINAL_PRODUCTION_REPORT.md` registra o que foi testado e as pendencias externas.
Este ZIP nao inclui credenciais, banco de dados, `node_modules` ou build `.next`.
