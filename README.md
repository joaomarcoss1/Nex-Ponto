# NexPonto v5.5.8 - Production Final Candidate

Sistema multiempresa de ponto, administração, funcionários, jornadas, banco de horas, relatórios e exportações regulatórias.

## O que a v5.5.8 corrige

- Login/admin sem bloqueio operacional por MFA/TOTP/AAL2.
- Cadastro, edição, desativação e reativação de administradores via RPC `upsert_tenant_admin_v557`, com compensação explícita entre `auth.users`, `admin_users` e `tenant_memberships`.
- Proteção do último Master realmente utilizável e preservação da role histórica `tenant_owner`.
- Autorização canônica por `tenant_memberships`, com rejeição explícita para divergência de role/filiais.
- Ponto mobile com validação prévia de recibo e sem falso erro quando o commit ocorreu e a geração de recibo falhou depois.
- Idempotência concorrente no registro de ponto: duplicate key retorna o lançamento existente.
- Readiness completo para secrets de tenant, sessão de funcionário, dispositivo, recibo, jobs, storage, banco e migrations.
- Jobs com `lease_token`, heartbeat periódico e executor agendado.
- Primeira troca de senha controlada pelo servidor em `app_metadata`, sem permitir que o navegador desative a exigência.
- RPCs `SECURITY DEFINER` fechadas para `PUBLIC`/`anon`, privilégios padrão restritos e schema `public` sem criação por usuários da API.
- GETs administrativos com RBAC, menu admin com rotas reais, shell mobile com focus trap e PWA cache v5.5.8.
- Listas de ponto e geo-report sem tetos fixos ocultos, com paginação/exportação completa.

## Rodar no VSCode

1. Instale Node 22 LTS.
2. Copie `.env.example` para `.env.local` e preencha valores reais do Supabase.
3. Rode:

```bash
npm ci
npm run doctor
npm run dev
```

## Validação local

```bash
npm run migrations:check
npm run structure:v57
npm run structure:v58
npm run lint
npm run typecheck
npm run test
npm run build
```

Checks online de Supabase, login master, RLS, storage, jobs externos e carga exigem ambiente real configurado.

Para o deploy descrito em `vercel.json`, use Vercel Pro ou Enterprise: o executor de jobs roda a cada cinco minutos. Consulte `docs/production/VERCEL_DEPLOYMENT.md`.
