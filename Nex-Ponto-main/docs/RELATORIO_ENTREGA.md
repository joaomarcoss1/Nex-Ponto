# Relatório de entrega — NexPonto

Data: 24/07/2026  
Versão-base transformada: 1.9.1  
Versão entregue: 2.0.0  
Stack: Next.js 15.5.21, React 19, TypeScript, Supabase, Tailwind CSS, PWA

## Resultado

O projeto foi transformado em **NexPonto**, com identidade visual azul, ciano, dourado e navy inspirada na referência NexLabs. A entrega está sem filiais, colaboradores, PINs ou credenciais reais e possui fluxo de configuração inicial.

O produto entregue é uma aplicação web responsiva e instalável como PWA. Não foi gerado binário nativo para App Store/Google Play.

## Principais implementações

- identidade NexPonto e novos ativos vetoriais;
- painel white-label para nome, slogan, logo, ícone, cinco cores e dados dos relatórios;
- aplicação da marca em tempo real;
- layout premium responsivo e navegação administrativa mobile;
- horário de funcionamento da filial por dia e vigência;
- filial com código, timezone, responsável, contato, GPS, geofence e raio;
- escala versionada com horário de almoço, vigência e turno que cruza meia-noite;
- correção da fonte de horário para priorizar escala específica/vigente;
- ajuste de ponto transacional sem copiar `idempotency_key`;
- conversão correta entre timezone e `datetime-local`;
- QR real por filial, rotativo, com expiração e validação no registro;
- diagnóstico de GPS que diferencia situação apta e inválida;
- importação restrita a master/RH, com atualização salarial e de escala;
- remoção de PIN do resumo persistido das importações;
- aprovação final com efeito transacional:
  - troca de turno cria escala excepcional;
  - folga cria justificativa aprovada;
  - compensação cria movimento no banco de horas;
  - outra filial cria autorização temporária;
- pré-folha com idempotência independente do usuário;
- troca transacional da memória da pré-folha;
- bloqueio de transições inválidas e imutabilidade de competências fechadas;
- `closed_with_exceptions` incluído nos bloqueios;
- limites de relatórios explícitos;
- relatório de almoço corrigido;
- recuperação de senha completa e troca obrigatória no primeiro acesso;
- criação de outros administradores com função, filial e permissão financeira;
- cabeçalhos de segurança;
- atualização do Next.js;
- auditoria npm sem vulnerabilidades conhecidas.

## Saneamento

Foram removidos:

- migrations com pessoas e filiais reais;
- documentos internos com PINs, salários e dados pessoais;
- seed de colaboradores e unidades;
- logotipos da empresa anterior;
- filiais fixas e coordenadas predefinidas;
- referências operacionais à marca anterior.

O script `pnpm security:data` bloqueia marca legada, CPF formatado, JWT, chave service role e campos de PIN em texto puro.

## Migration principal

`supabase/migrations/019_nexponto_professional_platform.sql`

Ela adiciona:

- horários de funcionamento;
- modelos de turno;
- recursos de escala profissional;
- branding;
- ajuste transacional de ponto;
- substituição transacional da memória da pré-folha;
- aplicação transacional de solicitações;
- colunas de memória financeira ausentes;
- limpeza defensiva de resumos antigos.

## Testes executados

| Verificação | Resultado |
|---|---|
| Varredura de dados/segredos | Aprovada |
| Migrations estáticas | 19 aprovadas em sequência |
| ESLint | Aprovado, zero erros |
| TypeScript | Aprovado, zero erros |
| Vitest | 15/15 testes aprovados |
| Build Next.js | Aprovado, 34 páginas geradas |
| npm audit produção | 0 vulnerabilidades |
| Layout desktop 1440 px | Aprovado, sem overflow |
| Layout mobile 390 px | Aprovado, sem overflow |

O teste integral das migrations contra uma instância Supabase real depende das credenciais do projeto de destino e deve ser executado antes do piloto.

## Screenshots

- `nexponto-login-desktop.png`
- `nexponto-ponto-mobile.png`

## Acesso administrativo

Nenhuma senha foi gravada no código ou no ZIP. Para criar o primeiro master:

1. copie `.env.example` para `.env.local`;
2. informe o e-mail administrativo desejado em `MASTER_ADMIN_EMAIL`;
3. crie uma senha nova com pelo menos 10 caracteres, incluindo letra e número;
4. crie um `MASTER_SETUP_TOKEN` aleatório;
5. abra `/admin/configuracao-inicial`;
6. remova a senha e o token das variáveis após a ativação.

A senha enviada na conversa não foi reutilizada: ela ficou exposta e não atende ao mínimo de 10 caracteres. Deve ser substituída.

## Riscos e validações externas

- homologar regras de banco de horas, horas extras, adicionais e acordos coletivos;
- homologar cálculos e arquivos com contador/DP;
- definir retenção, bases legais, atendimento a titulares e resposta a incidentes;
- testar RLS e isolamento com duas empresas reais antes de oferecer SaaS multi-tenant;
- validar GPS em cada aparelho, loja e condição de sinal;
- executar carga com a quantidade real de colaboradores;
- configurar SMTP e redirects do Supabase Auth;
- definir rotina de backup, restauração e monitoramento;
- homologar a PWA nos aparelhos que serão usados no ponto;
- desenvolver empacotamento nativo separadamente caso publicação em lojas seja obrigatória.

O código não declara conformidade automática com LGPD, eSocial, CLT ou Portaria 671.

## Roteiro de publicação

1. criar projeto Supabase separado para homologação;
2. aplicar `supabase db push`;
3. confirmar que todas as 19 migrations finalizaram;
4. executar `pnpm verify`;
5. cadastrar variáveis na Vercel;
6. configurar URLs de login e recuperação no Supabase Auth;
7. publicar na Vercel;
8. cadastrar uma filial piloto;
9. validar horários, GPS, QR e escala;
10. cadastrar poucos colaboradores de teste;
11. executar um ciclo completo de ponto;
12. revisar aprovações, banco de horas e pré-folha;
13. validar PDF/XLSX com RH e contabilidade;
14. realizar testes de isolamento, backup e restauração;
15. liberar gradualmente para produção.
