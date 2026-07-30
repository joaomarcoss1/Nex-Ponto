# Matriz de testes

| Camada | Casos |
|---|---|
| Unitário | salário 28/29/30/31, dinheiro, extras, banco, escala, jornada, branding, permissões, uploads |
| Contrato | tenant, hora extra, branding, pré-folha |
| Integração | migrations, APIs, RLS, RPCs, fechamento, storage |
| E2E | onboarding, filial, funcionário, escala, ponto, revisão, extra, banco, ausência, pré-folha, relatório, fechamento |
| Segurança | A/B, IDOR, MFA, suporte expirado, upload, rate limit, QR, headers, matrícula |
| Operação | carga, backup/restauração, GPS/QR físico, PWA compartilhado/custom domain |

Automatizados localmente: unitários e verificadores estruturais. Integração real e E2E autenticado dependem dos ambientes descritos em `.env.example`.

