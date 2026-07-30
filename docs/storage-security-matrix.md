# Matriz de Storage

## Caminho canonico

`{tenant_id}/{entity_type}/{entity_id}/{uuid-safe-filename}`

Exemplos:

`{tenant_id}/justifications/{justification_id}/{file_id}.pdf`

`{tenant_id}/exports/{job_id}/{file_id}.xlsx`

## Buckets privados

| Bucket | Entidade | Permissao de leitura | Permissao de escrita |
| --- | --- | --- | --- |
| `justificativas` | `absence_justifications` | `justification.view`, scan `clean`, filial autorizada | `justification.review`, tenant/filial/entidade validos |
| `nexponto-branding` | branding do tenant | `branding.manage` | `branding.manage` |
| `exports` | `background_jobs`/`report_exports` | `reports.export` | worker/servidor ou `reports.export` |
| `payroll-exports` | pre-folha/exportacao | `payroll.export`/`reports.export` | worker/servidor |
| `time-clock-receipts` | comprovantes | `time_entry.view` | worker/servidor |

## Downloads

Downloads privados devem usar `GET /api/admin/justifications/attachment?id=...`. A rota valida tenant, filial, permissao, caminho canonico, scan `clean`, gera URL assinada por 300 segundos e registra auditoria.

## Testes A/B

A suite `tests/integration/multitenancy-rls.test.ts` cobre leitura cruzada RLS, escrita cruzada em `employees`, listagem de prefixo Storage A/B e tentativa de upload no prefixo do tenant B.

