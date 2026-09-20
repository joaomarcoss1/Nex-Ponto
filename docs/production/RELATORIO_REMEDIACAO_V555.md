# Relatorio de Remediacao v5.5.5

## Causa raiz do login

O login administrativo era bloqueado no browser quando `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nao estavam embutidos no build. O botao "Entrar" ficava desabilitado antes de tentar autenticar, mesmo com e-mail, senha e backend corretos.

## Correcoes aplicadas

- Criada a rota publica segura `GET /api/public/runtime-config`.
- Cliente Supabase do browser agora carrega runtime config assincronamente, com cache, timeout, retry e mensagem de falha.
- `AdminLogin`, `AdminShell`, recuperacao de senha, nova senha e admin API foram atualizados para o cliente assincrono.
- Ambiente do servidor foi separado por capacidade: Supabase admin, Auth browser, login admin, tenant, funcionario, device, recibo e jobs.
- Login admin exige somente core Auth/DB e salts usados no proprio fluxo.
- Readiness passou a discriminar core, runtime browser, Auth, banco, migrations, funcoes criticas, rate limit, storage e jobs.
- Build da Vercel passou a executar `node scripts/validate-env.mjs --build`.
- Cron a cada minuto foi removido do `vercel.json`.
- Jobs regulatórios usam `contentType: text/plain`.
- Migration 055 foi protegida contra funcao legada com retorno incompativel.
- Migration 058 registra v5.5.5, reforca a funcao de reconciliacao e libera `text/plain` no bucket privado `exports`.

## Validado neste workspace

- `npm ci --no-audit --no-fund`
- `npm run security:data`
- `npm run security:rbac`
- `npm run ux:audit`
- `npm run migrations:check`
- `npm run structure:check`
- `npm run structure:v51`
- `npm run structure:v53`
- `npm run structure:v54`
- `npm run structure:v55`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run validate:env` com placeholders sintaticamente validos
- `npm run build` com placeholders sintaticamente validos
- `npm run audit`
- `npm run doctor`

## Nao executado neste workspace

Checks online de Supabase real, login master/admin real, RLS A/B, storage real, jobs reais e load test dependem de `.env.local`/credenciais de homologacao ou producao. Esses itens devem ser executados antes do go-live final.
