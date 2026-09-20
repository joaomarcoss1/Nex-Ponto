# Arquitetura NexPonto v5.3

## Limites

- `app/api`: autenticação HTTP, validação e chamada dos serviços;
- `lib/contracts`: DTOs e schemas compartilhados;
- `lib/security`: permissões, MFA, uploads e controles transversais;
- `lib/server`: Supabase, tenant, auditoria e adaptadores;
- `lib/services`: cálculos determinísticos;
- `supabase/migrations`: modelo, RLS, RPCs e histórico;
- `components`: interfaces por perfil.

## Fluxo

```text
Plataforma -> tenant -> administrador/RH -> funcionário
filial + contrato + escala -> ponto -> sessão -> revisão
revisão -> hora extra/banco/ausência -> pré-folha -> relatório -> fechamento
```

Na v5.3, o ponto também percorre dispositivo → geofence/GPS → risco → NSR →
comprovante. Exportações pesadas percorrem fila → lease → worker → storage
privado. Aprovações de pré-folha passam por atores distintos e ledger imutável.

O service role é restrito ao servidor. Consultas de domínio usam `createTenantScopedClient`, que injeta `tenant_id` e filtra operações. RLS continua obrigatória.

## Fontes canônicas

- autorização: `lib/security/authorization.ts`;
- branding: `tenant_branding`;
- banco de horas: ledger `hour_bank_movements`;
- pré-folha: motor profissional e rubricas/snapshots;
- tenant público: domínio verificado, código público, slug validado ou cookie contextual.
- NSR: `tenant_nsr_counters`, atribuído por trigger transacional;
- recibo: `time_clock_receipts`;
- jobs: `background_jobs` e `background_job_events`.

Folha oficial, eSocial e integrações contábeis são feature flags desativadas até homologação formal.
