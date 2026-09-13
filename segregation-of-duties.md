# Segregação de funções

## Pré-folha

O fluxo obrigatório é: preparação → conferência → aprovação RH → aprovação
financeira → fechamento → exportação. O criador do processamento não pode
aprovar pelo RH; o aprovador financeiro deve ser diferente do RH; o responsável
pelo fechamento deve ser diferente dos dois. A migration 050 aplica essas regras
no banco, sob lock da execução, e grava `payroll_state_transitions`.

Permissões: `payroll.calculate`, `payroll.resolve_divergence`,
`payroll.hr_approve`, `payroll.financial_approve`, `payroll.close`,
`payroll.export` e `payroll.reopen`. `payroll.mark_paid` permanece bloqueada
enquanto `FEATURE_OFFICIAL_PAYROLL=false`.

## Exceções

Fechamento com exceção exige divergência crítica explicitamente aceita e motivo.
Reabertura aceita apenas execução fechada/exportada, registra motivo e não apaga
aprovações. Toda mudança deve aparecer na auditoria e no ledger de transições.

## Teste de aceite

Usar ao menos quatro contas: preparador, RH, financeiro e fechador. Tentar cada
violação e confirmar a rejeição no banco, não apenas na interface.
