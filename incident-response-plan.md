# Plano de resposta a incidentes

Severidades: SEV-1 (vazamento, mistura de tenant, indisponibilidade total),
SEV-2 (ponto/folha degradados), SEV-3 (função não crítica), SEV-4 (dúvida).

Fluxo: detectar → nomear comandante → preservar logs/evidência → conter sem
destruir dados → avaliar titulares/tenants → recuperar → comunicar → post-mortem.
Em suspeita de mistura de tenant, bloquear rota/credencial e suspender exports.

Contatos e prazos legais devem ser preenchidos no ambiente do operador. Realizar
simulado trimestral com indisponibilidade do ponto e um cenário de privacidade.
Nunca inserir PIN, token, folha ou dado pessoal bruto no canal de incidente.
