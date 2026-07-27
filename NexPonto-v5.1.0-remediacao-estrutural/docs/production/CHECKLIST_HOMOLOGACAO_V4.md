# Checklist de homologação NexPonto v4

## Código e pacote

- [ ] `npm ci` em ambiente limpo;
- [ ] scanner de dados/segredos aprovado;
- [ ] migrations estáticas aprovadas;
- [ ] verificação estrutural aprovada;
- [ ] lint sem erros;
- [ ] typecheck sem erros;
- [ ] testes unitários aprovados;
- [ ] testes de integração aprovados;
- [ ] build aprovado;
- [ ] ZIP sem `node_modules`, `.next`, `.env`, cache ou logs.

## Banco e migrations

- [ ] aplicação do zero em PostgreSQL/Supabase temporário;
- [ ] upgrade da v2 sanitizada;
- [ ] upgrade da v3 com migration 020 aplicada;
- [ ] nenhum `tenant_id` nulo;
- [ ] constraints e índices validados;
- [ ] funções/RPCs executadas;
- [ ] rollback/recuperação ensaiado.

## Isolamento

- [ ] dois tenants com filiais e matrículas iguais;
- [ ] empresa A não lê/edita/exclui empresa B;
- [ ] rotas públicas isoladas;
- [ ] RLS testada com token autenticado;
- [ ] storage isolado;
- [ ] relatórios/exportações isolados;
- [ ] suporte temporário expira e é auditado.

## Ponto

- [ ] entrada e saída;
- [ ] dois intervalos;
- [ ] turno após meia-noite;
- [ ] timezone por filial;
- [ ] QR expirado/revogado/reutilizado;
- [ ] GPS dentro/fora/sem permissão/precisão ruim;
- [ ] duplo clique e duas abas;
- [ ] rate limit em duas instâncias;
- [ ] competência fechada bloqueia alterações;
- [ ] marcação manual auditada.

## Escala e RH

- [ ] modelos de turno;
- [ ] publicação semanal;
- [ ] conflito e cobertura;
- [ ] solicitação gestor/RH;
- [ ] banco de horas com estorno;
- [ ] histórico de vigência preservado.

## Pré-folha e relatórios

- [ ] memória histórica;
- [ ] ausência de dupla contagem;
- [ ] banco de horas integrado conforme política;
- [ ] valores negativos tratados explicitamente;
- [ ] branding em PDF/XLSX;
- [ ] comparação com sistema contábil em duas competências.

## Mobile e acessibilidade

- [ ] 320/360/390/412 px;
- [ ] 768/1024/1440/1920 px;
- [ ] Android e iPhone;
- [ ] teclado, foco e leitor de tela;
- [ ] zoom 200%;
- [ ] rede lenta;
- [ ] barra inferior sem sobreposição;
- [ ] administração por cards no celular.

## Operação

- [ ] monitoramento e alertas;
- [ ] jobs e dead-letter;
- [ ] SMTP/redirects;
- [ ] backup automático;
- [ ] restauração comprovada;
- [ ] RPO/RTO definidos;
- [ ] piloto com duas empresas;
- [ ] homologação RH/contabilidade;
- [ ] validação jurídica/LGPD quando aplicável.
