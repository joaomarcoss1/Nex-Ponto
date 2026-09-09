# Backup e restauração

Antes de qualquer atualização, gerar backup lógico do PostgreSQL e cópia dos buckets do Storage. A restauração deve ser testada fora de produção.

## Evidência mínima

Registrar data, ambiente, versão, tamanho, checksum, responsável, tempo de restauração, RPO e RTO. O sistema somente pode ser liberado após login, consulta de tenants, filiais, funcionários, pontos e relatórios no banco restaurado.

## Rollback

Não editar migrations aplicadas. Em falha, interromper tráfego, restaurar snapshot anterior e retornar o deploy da aplicação para a versão compatível. Mudanças de schema incompatíveis exigem migration corretiva documentada.
