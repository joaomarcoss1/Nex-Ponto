# Checklist de deploy — Vercel e Supabase

## Antes do deploy

1. criar backup consistente do PostgreSQL e dos buckets;
2. ensaiar restore em projeto isolado;
3. aplicar migrations 053 e 054 primeiro em homologação;
4. executar `npm run audit:database` e `npm run test:integration:required`;
5. executar `npm run verify:production` com variáveis reais;
6. homologar mobile em 320, 360, 375, 390, 412, 430, 768, 1024, 1366 e 1920 px.

## Variáveis obrigatórias

Configure na Vercel, separadas por ambiente: `APP_URL`, `NEXT_PUBLIC_APP_URL`, as três chaves Supabase e todos os secrets/salts de `.env.example` com no mínimo 32 caracteres. Em produção a URL deve ser HTTPS e nunca localhost. `SUPABASE_SERVICE_ROLE_KEY` é somente server-side.

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` é opcional; restrinja a chave por domínio/API. Sem chave, coordenadas manuais, GPS atual e link externo permanecem disponíveis. `NEXT_PUBLIC_ALLOW_TENANT_COLOR_OVERRIDE=false` mantém a identidade azul. MFA é opcional e só é imposto se as flags forem explicitamente `true`.

## Ordem segura

1. snapshot e janela de mudança;
2. migrations 053/054;
3. auditoria de banco;
4. deploy web;
5. `/api/health` deve retornar `alive`;
6. `/api/readiness` deve retornar `ready` sem nomes/valores de secrets;
7. smoke: Master, criação de tenant, convite, senha, onboarding, filial/horários, funcionário, ciclo, ponto e histórico;
8. monitorar erros, latência, Auth, banco, Storage, jobs e e-mail.

## Supabase

Use SMTP de produção e configure o redirect permitido `<APP_URL>/admin/nova-senha`. Não use service role no browser. Confirme grants/revokes, RLS em todas as tabelas com `tenant_id`, bucket privado `justificativas` e retenção de backups/logs conforme LGPD.
