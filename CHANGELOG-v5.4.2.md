# NexPonto v5.4.2

## Foco

Entrega reforçada para abrir e validar no VSCode, com auditoria explícita dos fluxos de empresa, administradores e funcionários.

## Melhorias

- Adicionado `npm run doctor` para validar pacote, rotas críticas, migrations, contrato de erro e variáveis esperadas.
- `npm run verify` passa a executar o diagnóstico estrutural antes das validações completas.
- `npm run verify:production` passa a exigir ambiente válido e diagnóstico antes de build/auditoria.
- README atualizado com o fluxo recomendado para VSCode.
- Adicionado relatório `docs/auditoria-producao-v5.4.2.md`.

## Resultado

O pacote é executável no VSCode e preparado para produção profissional, condicionado a `.env` real, Supabase configurado e migrations aplicadas.
