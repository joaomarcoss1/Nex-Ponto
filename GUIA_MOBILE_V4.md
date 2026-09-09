# Experiência mobile NexPonto v4

## Funcionários

Navegação principal com cinco destinos:

1. Início;
2. Ponto;
3. Escala;
4. Solicitações;
5. Perfil.

A tela inicial apresenta jornada, filial, próxima ação, status de conexão e avisos. O ponto exibe uma ação principal por vez, previne toque duplicado e só confirma a marcação após resposta do servidor.

### Critérios de homologação

Testar em 320, 360, 390 e 412 px:

- botão principal acima da barra inferior e da área segura;
- teclado virtual sem ocultar campos;
- textos sem corte;
- cards sem overflow;
- alvos de toque adequados;
- contraste e foco visíveis;
- zoom de 200%;
- leitor de tela básico;
- rede lenta e perda de conexão.

O ponto offline não deve simular sucesso. Nesta versão, o aplicativo informa que a marcação oficial precisa de conexão.

## Administração

O shell mobile adapta a navegação por papel. Tabelas operacionais devem virar cards ou listas com ações em menu contextual. O gerente pode acompanhar presença, intervalos, pendências, cobertura e realizar marcação manual.

Ações financeiras exigem permissão e devem ser protegidas por reautenticação/MFA quando a infraestrutura estiver configurada.

## Design

- navy e azul tecnológico como base;
- dourado apenas em destaques;
- tipografia legível;
- hierarquia clara;
- estados de loading, erro, sucesso e vazio;
- nenhuma ação crítica somente por ícone;
- safe-area para iPhone/Android;
- PWA instalável.
