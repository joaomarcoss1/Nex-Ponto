# NexPonto v5.5.1 — Production Ready Candidate para homologação

Plataforma SaaS multiempresa para controle de jornada, escalas, banco de horas, solicitações, pré-folha e conferência financeira, com portais web e mobile.

> **Estado desta entrega:** pacote executável, validado localmente e candidato a homologação
> final com Supabase real após aplicar as migrations `001` a `056`. Folha oficial, eSocial,
> CAdES e alegação REP-P permanecem desativados até homologação técnica, contábil e jurídica externa.

## O que a v5.5.1 corrige

- migration `056` com `REVOKE/GRANT` explícito para RPCs sensíveis `SECURITY DEFINER`;
- desativação e reativação de administradores preservando permissões, filiais e perfil;
- agregação SQL de banco de horas histórico para a pré-folha profissional;
- paginação por lote em consultas grandes da folha, relatórios e worker regulatório;
- remoção do limite artificial `.limit(5001)` em relatórios;
- rate limit de dispositivo em duas camadas: `tenant + IP` e `tenant + IP + device`;
- bloqueio seguro de anexos quando não há scanner antivírus real configurado;
- pós-processamento crítico do ponto sem erros ignorados;
- `requestId` estável por `Request` e helper `failForRequest`;
- settings empresariais canônicas em `tenant_settings`;
- scripts `structure:v551`, `audit:security-definer` e `test:load:clock-register`;
- testes locais para paginação acima de 5.000 linhas e request id.

## O que a v5.5 reforça

- matriz RBAC compartilhada entre rotas administrativas e menu lateral;
- permissões de leitura separadas de permissões de escrita/revisão;
- criação, atualização, desativação e reativação de administradores por RPC transacional;
- reconciliação auditável entre `admin_users` e `tenant_memberships`;
- contrato de erro com `requestId` propagado no payload e no header `x-request-id`;
- relatórios administrativos com paginação por lote, sem truncamento silencioso por `.limit(5001)`;
- anexos de justificativa bloqueados enquanto o status de varredura não for `clean`;
- rate limit distribuído também na API pública de dispositivo;
- índices adicionais para ponto, folha, banco de horas, dispositivos, anexos, rate limit e tentativas;
- função operacional de limpeza/retention para dados efêmeros;
- verificador estrutural `structure:v55` e evidências de validação documentadas.

## O que a v5.4 corrige

- fluxo de empresa transacional antes do envio do acesso, com idempotência, compensação e `pending_invite`;
- URL oficial centralizada, validação de secrets e readiness sem exposição de valores;
- contrato uniforme de erro com `code`, mensagem, `requestId` e `retryable`;
- `tenant_features.configuration` canônica com sincronização legada de `config`;
- Storage de justificativas isolado pelo diretório do tenant e escrita direta autenticada bloqueada;
- MFA opcional, sem ativação implícita em produção;
- salvamento atômico de filial e sete horários;
- paleta institucional azul/branco/dourado protegida contra branding verde legado;
- fallback elegante do mapa, rate limit nos fluxos públicos e limites de plano para funcionários;
- componentes mobile reutilizáveis, safe areas e Error Boundaries por área;
- auditoria de banco, código morto e gate obrigatório de integração real.

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

Requisitos: Node.js 22 LTS e npm 10.x. A faixa é validada também por `engines` e `.nvmrc`.

```bash
npm ci
cp .env.example .env.local
npm run doctor
npm run dev
```

PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run doctor
npm run dev
```

Abra `http://localhost:3000`.

O comando `npm run doctor` valida a estrutura crítica do pacote, as rotas de criação de empresa, administradores, funcionários, ponto público, contrato de erro, migrations e variáveis esperadas. Ele não expõe valores de segredo.

Para rodar conectado ao banco, preencha `.env.local` com um projeto Supabase real e aplique as migrations antes de usar as telas administrativas.

## Migrations

O pacote contém migrations sequenciais `001` a `056`. As migrations `053`, `054`, `055` e `056` são incrementais e não destrutivas.

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
npm run doctor
npm run migrations:check
npm run structure:check
npm run structure:v51
npm run structure:v53
npm run structure:v54
npm run structure:v55
npm run structure:v551
npm run audit:dead-code
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:integration:required
npm run test:e2e
npm run build
npm run audit
npm run audit:database
npm run audit:security-definer
npm run test:load:clock-register
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
- `docs/auditoria-producao-v5.5.0.md`;
- `docs/evidencias-validacao-v5.5.0.md`;
- `docs/auditoria-producao-v5.5.1.md`;
- `docs/evidencias-validacao-v5.5.1.md`;
