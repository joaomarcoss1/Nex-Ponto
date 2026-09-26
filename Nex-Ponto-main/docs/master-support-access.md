# Acesso master e suporte

O superadministrador gerencia tenants, mas não recebe acesso implícito aos dados
de um cliente. Para representar uma empresa deve abrir sessão temporária com:

- empresa exata, motivo mínimo, prazo de 5 a 120 minutos;
- MFA AAL2 válido;
- escopo `support_read`, `support_operational`, `support_financial` ou
  `full_access`;
- step-up explícito para financeiro/integral;
- cookie HTTP-only assinado, IP anonimizado e auditoria de início/fim.

Os escopos viram permissões no servidor. Não há wildcard e nem o escopo integral
inclui `payroll.mark_paid`. Sessões vencidas deixam de ser resolvidas como ativas.

Em produção, revisar mensalmente superadmins, sessões, motivos e acessos
financeiros. Conta compartilhada é proibida.
