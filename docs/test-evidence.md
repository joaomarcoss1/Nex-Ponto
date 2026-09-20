# Evidências de testes

## Baseline v5.3

- lint: aprovado;
- TypeScript: aprovado;
- unitários: 63/63;
- integração: 3 ignorados por credenciais ausentes;
- build Next.js: aprovado após liberação de cache em disco.

## v5.4 — validação final local

- `npm ci --ignore-scripts`: aprovado, 560 pacotes reconstruídos pelo lockfile;
- `npm run typecheck`: aprovado;
- `npm run lint`: aprovado;
- `npm run migrations:check`: 54 migrations aprovadas;
- `npm run structure:check`: aprovado;
- `npm run structure:v51`: 14/14 controles aprovados;
- `npm run structure:v53`: 8/8 controles aprovados;
- `npm run structure:v54`: 8/8 controles aprovados;
- `npm run security:data`: aprovado;
- `npm run audit:dead-code`: executado, nenhuma remoção automática;
- `npm run test`: 23 arquivos e 70/70 testes aprovados;
- `npm run build`: aprovado, 58 páginas geradas e rotas dinâmicas compiladas;
- `npm run test:e2e`: aprovado em Chromium desktop e Pixel 7 contra `next start`;
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades de produção;
- `npm audit`: zero vulnerabilidades após fixar também a árvore de desenvolvimento.

O E2E local valida headers de segurança e persistência do tema azul antes/depois do reload nas duas larguras. Como não há credenciais reais no pacote, respostas dependentes do Supabase retornaram 503 com contrato controlado e requestId, sem exposição de segredo.

Observações do host de validação: a máquina estava em Node 24/npm 11 e, corretamente, emitiu `EBADENGINE`, pois a versão suportada e exigida pelo pacote é Node 22/npm 10.x. O build terminou com código zero; apenas a persistência opcional do cache do webpack avisou `ENOSPC` devido ao pouco espaço livre do host, sem afetar os artefatos compilados.

## Gates externos não falsificados

- `npm run test:integration:required`: exige `TEST_SUPABASE_*` e falha explicitamente sem elas;
- `npm run audit:database`: exige Supabase real migrado;
- fluxos E2E autenticados de Master, Administrativo e colaborador exigem usuários/tenant de homologação;
- carga do caminho público exige `LOAD_TEST_TENANT`;
- SMTP/convite, Google Maps, restore, pentest e larguras reais exigem infraestrutura de homologação.
