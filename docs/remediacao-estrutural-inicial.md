# Baseline da remediação estrutural

Data: 2026-08-07. Fonte: pacote local v5.3.0 fornecido anteriormente; a cópia não contém diretório `.git`, portanto branch e commit inicial não estavam disponíveis. Nenhuma migration histórica foi removida.

## Arquitetura e inventário

- Next.js 15 App Router, React 19, TypeScript e Tailwind;
- Supabase Auth, PostgreSQL, RLS, Storage e RPCs `security definer`;
- SaaS multiempresa por `tenant_id`, membership, permissões e escopo de filial;
- 75 rotas de API na baseline, 42 páginas, 52 migrations e 245 arquivos TS/TSX;
- módulos: plataforma Master, autenticação Admin, onboarding, filiais/GPS/QR, funcionários, escalas/ciclos, ponto, justificativas, banco de horas, pré-folha, relatórios, auditoria e LGPD;
- papéis modernos e legados normalizados em `src/lib/security/authorization.ts`;
- integrações opcionais: Google Maps, SMTP/Supabase e telemetria.

## Baseline executada antes das alterações

| Gate | Resultado |
|---|---|
| Node/npm | v24.16.0 / 11.13.0 no host; projeto declara Node 22/npm 10 |
| lint | aprovado |
| typecheck | aprovado |
| unitários | 63/63 aprovados |
| integração | 3 ignorados por ausência de `TEST_SUPABASE_*` |
| build | aprovado; tentativa anterior falhou apenas por `ENOSPC` |
| npm ci | não repetido na baseline inicial por falta de espaço; lockfile e dependências existentes foram usados |

## Riscos encontrados e ordem adotada

1. e-mail de convite antes da transação do tenant;
2. divergência `tenant_features.config/configuration`;
3. Storage privado sem path de tenant e grants diretos amplos;
4. integração RLS podia ficar verde sendo ignorada;
5. MFA reativado implicitamente em produção contra a política atual;
6. secrets validados durante interação e erros técnicos expostos;
7. health divulgava métricas operacionais e não havia readiness separado;
8. branding persistido podia trocar azul por verde após hidratação;
9. filial e horários eram duas gravações independentes;
10. datas e fallbacks de timezone divergentes;
11. ausência de Error Boundaries por área e inconsistências mobile;
12. limites de plano incompletos e carga restrita apenas ao health.

Código potencialmente morto foi apenas classificado. Rotas Next, migrations, RPCs por string, assets PWA, relatórios e código financeiro não foram candidatos a exclusão automática.
