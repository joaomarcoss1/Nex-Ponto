# Evidências da entrega v5.3.0

Data: 29/07/2026.

## Resultado local real

| Verificação | Resultado |
|---|---|
| ESLint | aprovado |
| TypeScript (`tsc --noEmit`) | zero erros |
| unitários Vitest | 21 arquivos, 63 testes aprovados |
| migrations | 52 sequenciais verificadas |
| estrutura v4 | aprovada |
| estrutura v5.1 | 14 controles aprovados |
| estrutura v5.3 | 8 controles aprovados |
| dados sensíveis | nenhum segredo/dado real detectado |
| build Next.js 15.5.21 | aprovado, 57 páginas |
| E2E Chromium desktop/mobile | 2 testes aprovados |
| `npm audit --omit=dev` | zero vulnerabilidades |
| SBOM CycloneDX 1.5 | gerado em `artifacts/sbom.cdx.json` |
| instalação limpa | 562 pacotes com npm 10.9.2 |
| gate `npm run verify` na instalação limpa | aprovado integralmente |

O primeiro build detectou a ausência de `Suspense` na tela MFA; a implementação
foi corrigida e o build final passou.

## Limites honestos da evidência

A máquina executora usa Node 24.16.0, enquanto o pacote suporta e fixa Node 22
LTS/npm 10. A instalação limpa usou npm 10.9.2 e emitiu somente o aviso de engine
por causa do Node do host. A suíte de integração RLS contém três testes contra Supabase real,
mas foi ignorada por ausência das credenciais `TEST_SUPABASE_*`. Os E2E validaram
renderização, CSP e persistência da cor azul com configuração placeholder; APIs
de negócio dependentes de Supabase não foram consideradas aprovadas por esse
teste.

Não foram executados neste ambiente: migrations em PostgreSQL real, RLS A/B,
restore, carga autorizada, pentest, CAdES/ICP-Brasil ou homologação
trabalhista/contábil. Esses itens permanecem bloqueadores do go-live irrestrito.
