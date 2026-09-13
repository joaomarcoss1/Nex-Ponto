# Deploy do NexPonto no Vercel

## Requisito de plano

O `vercel.json` agenda `/api/internal/jobs/process` a cada cinco minutos. Esse intervalo exige **Vercel Pro ou Enterprise**. O plano Hobby aceita cron somente uma vez por dia e rejeita o deploy com essa expressão. Reduzir o executor para diário deixaria filas, exportações e rotinas operacionais atrasadas, portanto não é uma configuração válida de produção para o NexPonto.

## Configuração segura

1. Crie um projeto Supabase exclusivo do NexPonto; não reutilize banco de outro sistema.
2. Aplique, em ordem, as migrations `001` a `061` e execute `scripts/sql/postcheck-v558.sql`.
3. Cadastre no Vercel as variáveis da `.env.example`. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `MASTER_SETUP_TOKEN`, segredos de sessão ou salts com prefixo `NEXT_PUBLIC_`.
4. Configure `APP_URL` e `NEXT_PUBLIC_APP_URL` com o domínio HTTPS final.
5. Use Node.js 22 no projeto Vercel e execute `npm run build`.
6. Depois do primeiro bootstrap, remova `MASTER_SETUP_TOKEN` do Vercel e faça novo deploy.
7. Confirme que `/api/health` responde e que `/api/readiness` retorna estado pronto antes de liberar tráfego.

## Banco e Auth

- O estado obrigatório de primeira troca de senha fica em `app_metadata`, alterável apenas pelo servidor com `service_role`.
- As funções `SECURITY DEFINER` não concedem execução a `PUBLIC` ou `anon`; somente os helpers usados por RLS ficam liberados para `authenticated`.
- A role `service_role` só pode existir em rotas de servidor e variáveis protegidas do Vercel.
- Mantenha proteção contra senhas vazadas habilitada no painel Supabase Auth antes da abertura pública.

## Homologação mínima após o deploy

- login Master e administrativo;
- criação de empresa e proprietário;
- criação, edição, desativação e reativação de administrador;
- criação e edição de funcionário;
- registro de ponto e recibo;
- upload de justificativa;
- exportações, folha prévia e fila de jobs;
- isolamento entre duas empresas de homologação;
- navegação e formulários em desktop e mobile.
