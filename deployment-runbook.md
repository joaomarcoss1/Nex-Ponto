# Runbook de implantação

## Requisitos

- Node.js 22 LTS;
- npm 10;
- projeto Supabase separado por ambiente;
- SMTP/monitoramento quando habilitados.

## Instalação

```powershell
npm ci
Copy-Item .env.example .env.local
npm run env:check
npm run verify
npm run dev
```

## Migrations

1. backup de banco e storage;
2. `scripts/sql/precheck-v51.sql`;
3. ensaio em cópia sanitizada;
4. aplicar migrations 001–048 pelo fluxo aprovado do Supabase;
5. `scripts/sql/postcheck-v51.sql`;
6. testes RLS e piloto paralelo.

Produção exige MFA ativo, folha oficial desativada, domínio/DNS verificado, monitoramento, teste de restauração e aprovação manual da migration.

