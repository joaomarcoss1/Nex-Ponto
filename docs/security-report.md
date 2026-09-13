# Relatório de segurança v5.2

Controles: bearer validado no servidor, service role restrito, tenant proxy, RLS, HMAC, cookies seguros, bcrypt, rate limit, idempotência, QR/GPS, auditoria sanitizada, CSP/HSTS, MFA condicionado, sessão master expirada, assinatura binária de uploads, hash de anexos e matrícula mascarada.

`npm audit --omit=dev --audit-level=high`: zero vulnerabilidades após atualização do Playwright e override de `brace-expansion`. A geração/importação XLSX deve permanecer em regressão no CI.

Riscos residuais: prova RLS real, scanner antimalware externo, pentest/IDOR, observabilidade externa, rotação de segredos, restauração e homologação de dispositivos.

