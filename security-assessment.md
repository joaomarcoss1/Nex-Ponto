# Avaliação de segurança

Controles internos implementados: isolamento por tenant em cliente servidor e
RLS, permissões específicas, MFA AAL2, suporte temporário, rate limit distribuído,
PIN com bloqueio, dispositivo assinado, CSP com nonce, headers de segurança,
segredos somente no servidor, trilha de auditoria e scan de dados sensíveis.

Validações que exigem ambiente externo: teste RLS A/B com JWTs reais, pentest,
DAST, revisão de configuração Supabase, rotação de chaves, verificação de logs,
restauração, dependabot/monitor de CVE e teste de resposta a incidente.

Go-live é bloqueado por achado crítico/alto aberto, acesso anônimo indevido,
service role no cliente, bypass de MFA, mistura de tenant ou segredo exposto.
