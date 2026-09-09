# Regras da Pré-folha

## Escopo

O módulo é **Pré-folha e conferência de jornada**. Folha oficial, eSocial e cálculo legal definitivo permanecem desativados.

## Salário

- mensalista ativo por toda uma competência mensal recebe exatamente um salário;
- competências de 28, 29, 30 e 31 dias possuem testes dourados;
- admissão, desligamento e mudanças usam segmentos com divisor contratual;
- lacunas de salário/contrato geram divergência crítica.

## Jornada e ausências

- calendário publicado define os dias esperados;
- dia esperado sem sessão cria ausência total calculada;
- ausência pendente gera divergência crítica;
- `non_deductible` e `paid_leave` não descontam;
- `deductible` gera rubrica diária com memória;
- decisão registra responsável, motivo, snapshot e efeito financeiro.

## Horas extras

`aprovado = pagamento + banco`. Valor manual vazio significa cálculo automático. Override exige permissão, motivo e auditoria. Split financeiro é proporcional aos minutos de pagamento.

## Dinheiro

Valores críticos usam centavos com `bigint` e arredondamento half-up. Tela, banco e exportação devem consumir as rubricas persistidas.

## Fechamento

Divergências críticas, ausência sem decisão, tabela legal ausente, contrato/salário sem cobertura e snapshot inválido impedem fechamento normal.

