# Jobs e Workers

## Estrutura

`background_jobs` possui tenant, tipo, payload, schema version, idempotency key, status, progresso, tentativas, lease, heartbeat, prioridade, timeout, expiracao, resultado e erro seguro.

## Tipos atuais

`regulatory_export_preview`: gera arquivo tecnico preliminar em bucket privado.

`attachment_scan`: valida anexo em quarentena e libera somente quando scanner retorna `clean`.

## Worker

`POST /api/internal/jobs/process` exige `Authorization: Bearer INTERNAL_JOBS_SECRET`, reserva com `claim_background_job_v53` e `SKIP LOCKED`, aplica lease e usa backoff/dead-letter via `fail_background_job_v53`.

