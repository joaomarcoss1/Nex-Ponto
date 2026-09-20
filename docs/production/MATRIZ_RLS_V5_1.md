# Matriz RLS e permissões v5.1

| Recurso | Leitura | Escrita | Exclusão direta |
|---|---|---|---|
| Períodos e itens históricos | `payroll.view`/`financial.view` | RPC profissional | Bloqueada |
| Runs profissionais | Financeiro autorizado | RPC profissional | Bloqueada |
| Rubricas e divergências | Financeiro autorizado | RPC transacional | Bloqueada |
| Banco de horas | Perfis autorizados no tenant/filial | RPC append/reverse | Bloqueada |
| Horas extras | Gestor/RH conforme permissão | RPC de aprovação | Bloqueada |
| Tabelas legais | Financeiro autorizado | Administração controlada | Bloqueada |
| Ciclos e cobertura | Gestor/RH da filial | RPC de planejamento | Soft delete/status |
| Exportações | Financeiro autorizado | Job/RPC | Expiração controlada |

## Testes obrigatórios

- empresa A não acessa empresa B;
- gestor de filial A não acessa filial B;
- usuário somente leitura não escreve;
- auditor não altera;
- funcionário vê somente os próprios dados;
- folha fechada não aceita mutação;
- URL/ID de exportação de outro tenant retorna acesso negado.
