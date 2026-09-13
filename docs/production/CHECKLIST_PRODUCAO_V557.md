# Checklist de produção v5.5.7

Marque cada item com evidência do ambiente real.

- [ ] Backup restaurado com sucesso em ambiente isolado.
- [ ] Precheck v5.5.7 sem `FAIL`.
- [ ] Migration 060 aplicada sem erro.
- [ ] Postcheck v5.5.7 sem `FAIL`.
- [ ] Readiness 200, versão 5.5.7 e todos os checks obrigatórios verdes.
- [ ] Login master e administrativo por e-mail/senha validado.
- [ ] Criação completa de empresa e proprietário validada.
- [ ] CRUD de filiais e funcionários validado.
- [ ] CRUD de administradores validado, inclusive compensação em falha do Auth.
- [ ] Proteção do último master efetivo validada.
- [ ] Isolamento RLS testado entre dois tenants.
- [ ] Registro de ponto, idempotência e recibo validados no mobile.
- [ ] Worker/cron, heartbeat, retry e lease validados.
- [ ] Storage, relatórios, exportações e pré-folha validados.
- [ ] Layout conferido em 360, 390, 430, 768, 1024, 1366, 1440 e 1920 px.
- [ ] Alertas, logs estruturados e procedimento de rollback testados.
- [ ] Aprovação formal do responsável técnico registrada.

Sem todos os itens, o estado correto é **NÃO HOMOLOGADO PARA PRODUÇÃO**.
