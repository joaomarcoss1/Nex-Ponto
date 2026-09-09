# Backup e restauração — NexPonto v4

## Escopo

O backup deve cobrir:

- PostgreSQL/Supabase;
- buckets de documentos e branding;
- configurações de Auth relevantes;
- variáveis de ambiente em cofre seguro;
- versão do código e migrations.

## Antes de migration ou deploy crítico

1. registrar data, versão e responsável;
2. gerar backup do banco;
3. exportar inventário dos objetos de storage;
4. calcular checksum;
5. guardar cópia fora do ambiente primário;
6. restaurar em homologação;
7. executar smoke tests.

## Teste de restauração

A restauração só é considerada comprovada quando:

- todas as migrations são reconhecidas;
- autenticação funciona;
- dois tenants continuam isolados;
- filiais, funcionários, pontos e relatórios conferem;
- arquivos de storage abrem somente para o tenant autorizado;
- jobs e auditoria continuam íntegros.

## RPO e RTO

Defina formalmente antes da produção:

- RPO: perda máxima aceitável de dados;
- RTO: tempo máximo para restabelecer o serviço;
- frequência e retenção dos backups;
- responsável por incidente;
- canal de comunicação.

## Incidente

1. restringir acesso;
2. preservar logs;
3. identificar tenants afetados;
4. não sobrescrever evidências;
5. restaurar em ambiente paralelo;
6. executar validações;
7. trocar o tráfego somente após aprovação;
8. documentar causa, impacto e prevenção.
