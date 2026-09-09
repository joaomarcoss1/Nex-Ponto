# Diagnóstico inicial de produção — NexPonto v5.2.0

Data da avaliação: 29/07/2026.

## Estado recebido

O projeto chegou compilável e com base multiempresa, ponto, escalas, banco de
horas e pré-folha profissional. O produto já se identificava como pré-folha,
mantinha a folha oficial desativada e possuía 48 migrations aditivas.

## Evidências antes da remediação v5.3

| Verificação | Resultado real |
|---|---|
| instalação limpa com npm 10.9.2 | 562 pacotes instalados |
| `npm run lint` | aprovado |
| `npm run typecheck -- --incremental false` | zero erros |
| `npm test` | 16 arquivos e 51 testes aprovados |
| `npm run migrations:check` | 48 migrations aprovadas |
| `npm run security:data` | aprovado |
| verificadores estruturais | aprovados |
| `npm run build` | aprovado; 51 páginas geradas |
| `npm audit --omit=dev --audit-level=high` | zero vulnerabilidades |

A máquina de avaliação usa Node.js 24.16.0 e emitiu aviso de engine. O projeto
fixa Node.js 22 LTS e npm 10, que permanecem como ambiente suportado.

## Bloqueadores encontrados

1. A API profissional usa autorização genérica para transições financeiras.
2. Sessões de suporte armazenam escopo, mas concedem todas as permissões.
3. A tabela de dispositivos autorizados não participa do registro de ponto.
4. Não existem NSR e comprovante regulatório vinculados à marcação.
5. AFD, AEJ e assinatura CAdES não estão implementados.
6. Relatórios profissionais são produzidos de forma síncrona.
7. Não há prova RLS A/B em Supabase real.
8. MFA é verificado pelo `aal`, mas não há interface completa de matrícula.
9. Não há teste real de restauração, carga do ponto ou pentest externo.
10. O programa técnico LGPD não possui fluxo operacional dentro do produto.
11. O CSS global e alguns componentes/APIs concentram responsabilidades.
12. O PWA não registra ponto offline, por decisão segura, mas requer contingência.

## Riscos

- autorização financeira excessiva;
- suporte master com privilégio maior que o escopo declarado;
- fraude por compartilhamento de PIN/dispositivo;
- mistura de tenant ainda não comprovada por infraestrutura real;
- alegação regulatória indevida sem AFD/AEJ/comprovante/assinatura;
- indisponibilidade ou timeout em exportações grandes;
- ausência de evidência de recuperação de desastre.

## Ordem da remediação

1. catálogo de erros, permissões e segregação;
2. escopos master e MFA;
3. isolamento/RLS e dispositivos;
4. antifraude, NSR e comprovantes;
5. pré-folha e exportações;
6. filas e observabilidade;
7. LGPD e operação SaaS;
8. mobile, testes, carga e documentação.

## Critérios de aceite

- nenhuma migration destrutiva;
- TypeScript, lint, unitários e build aprovados;
- permissões específicas por transição;
- escopo master aplicado no servidor;
- dispositivo integrado ao ponto;
- NSR concorrente e comprovante persistido;
- fila idempotente com retry/dead-letter;
- folha oficial indisponível;
- documentação explícita das validações externas pendentes.

RLS real, restauração, carga completa, CAdES e pentest não podem ser aprovados
sem credenciais, certificado e infraestrutura externos.
