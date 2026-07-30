# Recuperação de desastre

RPO/RTO devem constar no contrato e ser provados. Baseline proposto ao piloto:
RPO ≤ 15 minutos e RTO ≤ 4 horas, condicionado ao plano do provedor.

Ordem: declarar desastre; congelar mudanças; restaurar banco em ambiente isolado;
restaurar objetos; aplicar/verificar migrations; executar checks de tenant,
contagens, NSR, recibos e folha; trocar endpoints; monitorar; comunicar.

Backup não é evidência de recuperação. Fazer teste mensal de restore e registrar
tempo, checksums, perdas, responsável e ações. Consultar também
`backup-restore-runbook.md`.
