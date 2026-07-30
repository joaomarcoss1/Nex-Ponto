# Evidências de teste v5.2

Registro das execuções finais realizadas em 29/07/2026 sobre uma cópia limpa do pacote.

| Verificação | Resultado |
|---|---|
| instalação limpa com npm 10.9.2 | 562 pacotes instalados a partir do `package-lock.json` |
| `npm run lint` | aprovado, sem erros ou avisos |
| `npm run typecheck -- --incremental false` | aprovado, zero erros |
| `npm test` | 16 arquivos e 51 testes aprovados |
| regressão XLSX | 2 testes aprovados: modelo de importação e relatório de pré-folha gerados e reabertos |
| `npm run test:e2e` | 2 cenários aprovados em Chromium desktop e mobile |
| estabilidade do branding | azul preservado antes e depois do reload no navegador |
| headers de segurança | CSP e `X-Content-Type-Options` confirmados no navegador |
| `npm run build` | aprovado com Next.js 15.5.21; 51 páginas estáticas geradas |
| `npm run migrations:check` | 48 migrations aprovadas |
| `npm run security:data` | aprovado |
| `npm run structure:v51` | 14 verificações aprovadas |
| `npm audit --omit=dev --audit-level=high` | zero vulnerabilidades |

## Limites desta evidência

- Os dois testes de integração foram corretamente ignorados porque `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` e `TEST_SUPABASE_SERVICE_ROLE_KEY` não foram fornecidos.
- Não foram realizados teste RLS A/B em Supabase real, restauração de backup, carga, dispositivos físicos ou homologação contábil/jurídica.
- A máquina de validação possui Node.js 24.16.0; o projeto fixa Node.js 22 LTS no `package.json` e em `.nvmrc`. A instalação emitiu somente o aviso de engine e todas as verificações acima passaram.
