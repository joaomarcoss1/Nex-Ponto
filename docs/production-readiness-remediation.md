# Remediação e prontidão para produção — v5.2

## Situação inicial

- tema azul alterava para verde após a busca assíncrona;
- 726 erros TypeScript;
- salário mensal proporcional ao número de dias do calendário;
- ausência integral invisível à pré-folha;
- UI/API de horas extras incompatíveis;
- banco de horas público somava débitos;
- owner moderno recebia 403 em APIs legadas;
- master não possuía acesso temporário auditado;
- onboarding retornava DTO incompatível;
- 9 vulnerabilidades altas de produção;
- sem E2E/RLS real executado.

## Alterações

Foram implementados tipos discriminados, ES2022, permissões canônicas, suporte auditado, DTOs compartilhados, branding server-side, PWA canônico, salário integral, efeito de ausência, ledger de banco, upload por assinatura, headers, observabilidade, migrations 045–048, testes e CI.

## Evidência local

- TypeScript: passou com zero erros;
- lint: passou sem erros ou avisos;
- unitários: 51 testes em 16 arquivos passaram;
- XLSX: modelo de importação e relatório de pré-folha foram gerados e reabertos;
- E2E: 2 cenários passaram em Chromium desktop e mobile, validando headers e estabilidade visual;
- migrations: 48 verificadas;
- auditoria de produção: zero vulnerabilidades;
- build final: aprovado com Next.js 15.5.21 e 51 páginas estáticas;
- instalação limpa a partir do lockfile: aprovada.

## Bloqueios externos

Ainda exigem ambiente/terceiros: RLS real A/B, E2E autenticado completo, dispositivos GPS/QR, carga, restauração, MFA do provedor, contador/DP, jurídico/LGPD/Portaria 671 e credenciais de produção.

## Rollback

Aplicação pode voltar à v5.1 sem remover colunas. Revogar suporte, preservar migrations aplicadas e seguir `docs/migration-guide.md`.
