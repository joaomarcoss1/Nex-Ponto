# Offboarding do cliente

Confirmar autoridade, escopo, data e retenções. Suspender novos acessos sem apagar
evidência; revogar sessões/domínios; gerar exportação com checksum; obter aceite;
manter dados pelo prazo legal/contratual com acesso restrito; então executar
purga aprovada e verificável de banco, storage, cache e backups conforme política.

Registrar tudo em `tenant_lifecycle_requests`. Purga exige dupla aprovação e não
é automática nesta versão. Superadmins e integrações também devem ser revogados.
