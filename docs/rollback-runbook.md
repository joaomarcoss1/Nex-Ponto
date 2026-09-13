# Runbook de rollback v5.3

As migrations 049–052 são aditivas. Antes do deploy: snapshot, precheck,
inventário de objetos e ensaio em cópia sanitizada.

Se a aplicação falhar, reimplantar o artefato anterior e desativar rotas v5.3;
não apagar colunas/tabelas. Se uma migration falhar parcialmente, interromper,
preservar logs, restaurar em clone e corrigir com nova migration forward-only.

Não retroceder NSR, recibos, ledger de folha ou eventos de fila. Após retorno,
validar login, tenant, ponto, NSR, jornadas abertas, pré-folha, storage e health.
