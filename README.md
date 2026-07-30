# NexPonto v5.3.0 — Piloto comercial controlado

Plataforma SaaS multiempresa para controle de jornada, escalas, banco de horas, solicitações, pré-folha e conferência financeira, com portais web e mobile.

> **Estado desta entrega:** sistema executável e candidato a piloto comercial
> controlado. Folha oficial, eSocial, CAdES e alegação REP-P permanecem
> desativados até homologação técnica, contábil e jurídica externa.

## O que a v5.3 acrescenta

- permissões específicas e segregação obrigatória na pré-folha;
- MFA AAL2 com matrícula TOTP para todos os perfis administrativos;
- suporte master temporário com escopo real, step-up e auditoria;
- identidade assinada e aprovação de dispositivos de ponto;
- antifraude explicável, NSR por tenant e comprovante com SHA-256;
- prévias determinísticas AFD/AEJ sempre identificadas como não homologadas;
- fila com lease, retry exponencial, idempotência e dead-letter;
- fluxo operacional LGPD e ciclo de vida de tenant;
- CSP com nonce e correção definitiva do tema institucional azul;
- documentação completa de piloto, incidentes, DR, rollback e go/no-go.

## O que a v5.2 corrige

- banco de horas com minutos positivos e sinal definido por tipo;
- normalização segura dos movimentos legados;
- estorno imutável e idempotência;
- snapshot histórico autocontido e com checksum;
- marcações carregadas por `work_session_id`, inclusive quando terminam no mês seguinte;
- contratos e tabelas legais versionados e sem sobreposição;
- motor profissional de pré-folha com rubricas, divergências e memória;
- valor aprovado de horas extras respeitado;
- split entre pagamento e banco de horas;
- RLS financeira separando leitura de escrita;
- motor antigo de folha bloqueado para novas gravações;
- ciclos de escala, cobertura e publicação transacional;
- experiência mobile por cards para pré-folha e escalas;
- relatórios PDF/XLSX profissionais;
- precheck, postcheck, CI e documentação de rollback.
- TypeScript sem erros e target ES2022;
- permissões canônicas e owner moderno;
- suporte master temporário e auditado;
- tema azul canônico sem flash;
- onboarding idempotente;
- salário integral para 28/29/30/31 dias;
- ausência total e efeito financeiro explícito;
- contratos UI/API de horas extras;
- saldo contábil único do banco de horas;
- CSP, HSTS, uploads por assinatura e health check.

## Stack

- Next.js 15;
- React 19;
- TypeScript;
- Supabase/PostgreSQL;
- Tailwind CSS;
- PDFKit;
- ExcelJS;
- Vitest.

## Instalação no VS Code

Requisitos: Node.js 22 LTS e npm 10+.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`.

## Migrations

O pacote contém migrations sequenciais `001` a `052`.

Antes de aplicar em ambiente com dados:

1. crie backup do banco e storage;
2. execute `scripts/sql/precheck-v51.sql`;
3. ensaie o upgrade em cópia sanitizada;
4. aplique as migrations em homologação;
5. execute `scripts/sql/postcheck-v51.sql`;
6. compare assinaturas e contagens;
7. teste RLS com dois tenants;
8. calcule uma competência em modo paralelo.

Não edite migrations já aplicadas.

## Rotas principais

### Funcionário

- `/inicio`;
- `/` — ponto;
- `/escala`;
- `/solicitacoes`;
- `/perfil`.

### Administração

- `/admin`;
- `/admin/folha` — motor profissional v5.1;
- `/admin/folha-legada` — consulta histórica;
- `/admin/planejamento-escalas`;
- `/admin/escalas-profissionais`;
- `/admin/modelos-turno`.

### Plataforma

- `/platform`.

## Verificações

```bash
npm run security:data
npm run migrations:check
npm run structure:check
npm run structure:v51
npm run structure:v53
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run build
npm run audit
```

Execução completa:

```bash
npm run verify
```

## Pré-folha

A nomenclatura correta é:

> **Pré-folha e conferência de jornada — modo de simulação e homologação**

O sistema não deve ser apresentado como folha oficial, eSocial integrado ou cálculo legal definitivo antes da homologação contábil.

## Mobile

A interface do funcionário usa cinco destinos e uma ação principal de ponto. A administração móvel utiliza cards, filtros adaptados e memória de cálculo. O ponto offline permanece desabilitado até homologação específica.

## Documentação

Consulte:

- `docs/production/ARQUITETURA_REMEDIACAO_V5_1.md`;
- `docs/production/MATRIZ_RLS_V5_1.md`;
- `docs/production/GUIA_MIGRACAO_V5_1.md`;
- `docs/production/GUIA_MOBILE_PREMIUM_V5_1.md`;
- `docs/production/CHECKLIST_PRODUCAO_V5_1.md`;
- `docs/production/ROLLBACK_V5_1.md`.
