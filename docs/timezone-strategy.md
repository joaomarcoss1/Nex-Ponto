# Estrategia de Timezone

## Ordem de resolucao

1. Timezone da filial.
2. Timezone do tenant.
3. `DEFAULT_TIMEZONE`.
4. Fallback tecnico `America/Sao_Paulo`.

## Implementacao

O servico central fica em `src/lib/time/operational-time.ts`. APIs publicas de ponto, portal e historico usam `resolveOperationalTimezone`.

## Testes

`src/lib/time/__tests__/operational-time.test.ts` cobre `America/Fortaleza`, `America/Sao_Paulo`, `America/Manaus`, `America/Rio_Branco`, virada UTC e competencia local.

