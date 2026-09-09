# Rollback seguro v5.1

1. interrompa novas gerações e exportações;
2. preserve logs e IDs das execuções;
3. desative as features profissionais no tenant;
4. não edite movimentos do banco de horas;
5. restaure o backup em projeto Supabase separado;
6. compare precheck, postcheck e assinaturas;
7. faça smoke tests;
8. altere as variáveis da aplicação somente após validação;
9. mantenha o ambiente afetado para investigação;
10. registre incidente e auditoria.

Migrations aplicadas e utilizadas não devem ser apagadas ou reescritas. Correções devem ocorrer por nova migration ou por restauração integral validada.
