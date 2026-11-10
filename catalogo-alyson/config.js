/* =====================================================================
   CATÁLOGO — ARQUIVO DE CONFIGURAÇÃO
   ---------------------------------------------------------------------
   Tudo o que aparece no catálogo sai daqui. Para adicionar um ebook,
   curso ou produto, copie um bloco dentro de `produtos` e edite.

   ⚠️  ANTES DE PUBLICAR: troque os textos marcados com "EXEMPLO",
       os links de checkout, os números de prova social e os
       depoimentos por informações REAIS. Depoimento ou número
       inventado derruba a confiança (e pode violar o CDC).
   ===================================================================== */

window.CATALOGO = {
  marca: {
    nome: "Veritas Digital",
    autor: "Alyson Barbosa",
    slogan: "Conteúdo de valor. Conhecimento de verdade.",
    // Foto do Alyson (quadrada, mín. 600x600). Coloque em /assets e troque aqui.
    // Deixe "" para usar o símbolo Veritas.
    foto: "",
    instagram: "https://instagram.com/", // ← @ do Alyson
    whatsapp: "5500000000000", // ← DDI + DDD + número, só dígitos
    mensagemWhatsapp: "Olá! Vim pelo catálogo Veritas Digital e quero saber mais sobre",
    email: "contato@exemplo.com",
    // Meta Pixel (opcional) — cole só o ID numérico para rastrear
    // ViewContent / InitiateCheckout / Lead nos anúncios.
    metaPixelId: ""
  },

  hero: {
    selo: "Catálogo oficial",
    titulo: "Conhecimento de <em>verdade</em>.",
    subtitulo:
      "Ebooks, cursos e preparatórios criados para você sair do lugar com método, clareza e acompanhamento. Acesso imediato após a compra.",
    assinatura: "por Alyson Barbosa",
    // ⚠️ EXEMPLO — coloque os números reais (ou remova itens).
    provas: [
      { valor: 2400, prefixo: "+", sufixo: "", rotulo: "alunos atendidos" },
      { valor: 12, prefixo: "", sufixo: "", rotulo: "materiais publicados" },
      { valor: 4.9, prefixo: "", sufixo: "★", rotulo: "avaliação média", casas: 1 }
    ]
  },

  faixaTopo: [
    "Acesso imediato no seu e-mail",
    "Pagamento 100% seguro",
    "Garantia incondicional de 7 dias",
    "Pix, cartão em até 12x ou boleto"
  ],

  // Oferta com contagem regressiva no produto destaque.
  // Use uma data REAL de fim da promoção. Deixe "" para esconder o timer.
  ofertaTerminaEm: "",

  categorias: [
    { id: "todos", nome: "Tudo" },
    { id: "ebook", nome: "Ebooks" },
    { id: "curso", nome: "Cursos" },
    { id: "preparatorio", nome: "Preparatórios" },
    { id: "produto", nome: "Produtos" }
  ],

  /* -------------------------------------------------------------------
     PRODUTOS
     - id: único, sem espaço (vai na URL: ?p=id)
     - categoria: ebook | curso | preparatorio | produto
     - preco / precoDe: números (precoDe = preço "riscado", opcional)
     - parcelas: em quantas vezes mostrar (ex.: 12)
     - checkout: link da Hotmart / Kiwify / Eduzz / Stripe / Mercado Pago
       (deixe "" para o botão abrir o WhatsApp)
     - capa: "azul" (linha padrão) | "vinho" (coleção premium) | "pergaminho"
       OU imagem: "/assets/minha-capa.jpg" (proporção 3:4)
     - selo: "Mais vendido", "Novo", "Lançamento"... (opcional)
     - emBreve: true → vira lista de espera (captura lead)
     ------------------------------------------------------------------- */
  produtos: [
    {
      id: "metodo-essencial",
      destaque: true,
      categoria: "ebook",
      selo: "Mais vendido",
      titulo: "O Método Essencial",
      subtitulo: "O passo a passo completo para sair do zero com estratégia",
      descricao:
        "EXEMPLO — Um guia direto ao ponto que organiza tudo o que você precisa saber em uma sequência lógica, com exemplos práticos, checklists e modelos prontos para aplicar hoje mesmo.",
      beneficios: [
        "Plano de ação de 30 dias, dia a dia",
        "Checklists e modelos prontos para copiar",
        "Os 7 erros que travam a maioria — e como evitar",
        "Estudos de caso reais explicados passo a passo"
      ]  ,
      paraQuem: "Para quem está começando ou se sente perdido com tanta informação solta.",
      inclusos: ["Ebook em PDF (120 páginas)", "Planilha de acompanhamento", "Atualizações gratuitas"],
      formato: "PDF · 120 páginas",
      preco: 47,
      precoDe: 97,
      parcelas: 12,
      checkout: "",
      capa: "azul"
    },
    {
      id: "guia-produtividade",
      categoria: "ebook",
      selo: "Novo",
      titulo: "Rotina de Alta Performance",
      subtitulo: "Produtividade sem burnout",
      descricao:
        "EXEMPLO — Como montar uma rotina sustentável que cabe na sua vida real, com técnicas de foco, gestão de energia e planejamento semanal.",
      beneficios: [
        "Modelo de planejamento semanal",
        "Técnicas de foco profundo",
        "Como sair da procrastinação em 5 minutos"
      ],
      paraQuem: "Para quem vive ocupado, mas sente que não avança.",
      inclusos: ["Ebook em PDF (80 páginas)", "Planner imprimível"],
      formato: "PDF · 80 páginas",
      preco: 37,
      precoDe: 67,
      parcelas: 12,
      checkout: "",
      capa: "azul"
    },
    {
      id: "mentalidade",
      categoria: "ebook",
      titulo: "Mentalidade Inabalável",
      subtitulo: "Disciplina, constância e autoconfiança",
      descricao:
        "EXEMPLO — Ferramentas práticas de psicologia aplicada para manter a constância mesmo nos dias difíceis.",
      beneficios: ["Exercícios diários de 10 minutos", "Diário guiado de 21 dias", "Roteiro para lidar com a ansiedade"],
      paraQuem: "Para quem começa com força e desiste no meio do caminho.",
      inclusos: ["Ebook em PDF (64 páginas)", "Diário guiado"],
      formato: "PDF · 64 páginas",
      preco: 29,
      precoDe: 49,
      parcelas: 6,
      checkout: "",
      capa: "pergaminho"
    },
    {
      id: "curso-completo",
      categoria: "curso",
      selo: "Mais completo",
      titulo: "Formação Completa",
      subtitulo: "Curso em vídeo do básico ao avançado",
      descricao:
        "EXEMPLO — Mais de 40 aulas gravadas, materiais de apoio e encontros ao vivo mensais para tirar dúvidas. A forma mais rápida de chegar ao próximo nível com acompanhamento.",
      beneficios: [
        "40+ aulas em vídeo, assista quando quiser",
        "Encontros ao vivo mensais",
        "Comunidade exclusiva de alunos",
        "Certificado de conclusão"
      ],
      paraQuem: "Para quem quer acompanhamento e um caminho completo, não só um material.",
      inclusos: ["Acesso por 12 meses", "Todos os ebooks de bônus", "Suporte direto"],
      formato: "Online · 12 meses de acesso",
      preco: 297,
      precoDe: 597,
      parcelas: 12,
      checkout: "",
      capa: "vinho"
    },
    {
      id: "preparatorio-intensivo",
      categoria: "preparatorio",
      selo: "Turma aberta",
      titulo: "Preparatório Intensivo",
      subtitulo: "Revisão estratégica com simulados",
      descricao:
        "EXEMPLO — Cronograma guiado, banco de questões comentadas e simulados com correção para você chegar no dia da prova seguro(a).",
      beneficios: [
        "Cronograma personalizado por semana",
        "Banco de questões comentadas",
        "Simulados com ranking",
        "Revisões ao vivo antes da prova"
      ],
      paraQuem: "Para quem tem data marcada e precisa de estratégia, não de mais conteúdo.",
      inclusos: ["Acesso até a data da prova", "Simulados", "Grupo de estudos"],
      formato: "Online · Turma 2026",
      preco: 197,
      precoDe: 397,
      parcelas: 12,
      checkout: "",
      capa: "azul"
    },
    {
      id: "preparatorio-proximo",
      categoria: "preparatorio",
      emBreve: true,
      selo: "Em breve",
      titulo: "Preparatório Elite",
      subtitulo: "Próxima turma — vagas limitadas",
      descricao:
        "EXEMPLO — Turma reduzida com acompanhamento individual. Entre na lista de espera e receba a abertura das vagas com condição especial antes de todo mundo.",
      beneficios: ["Acompanhamento individual", "Turma reduzida", "Condição exclusiva para a lista de espera"],
      paraQuem: "Para quem quer o máximo de acompanhamento.",
      inclusos: ["Prioridade na abertura", "Bônus para lista de espera"],
      formato: "Online · Abertura em breve",
      preco: 0,
      parcelas: 0,
      checkout: "",
      capa: "vinho"
    },
    {
      id: "planner-fisico",
      categoria: "produto",
      titulo: "Planner Premium",
      subtitulo: "Edição física em capa dura",
      descricao:
        "EXEMPLO — O planner oficial do método, em capa dura, papel pólen 90g e acabamento com hot stamping dourado. Enviado para todo o Brasil.",
      beneficios: ["Capa dura com hot stamping", "Papel pólen 90g", "Envio para todo o Brasil"],
      paraQuem: "Para quem prefere planejar no papel.",
      inclusos: ["Planner físico", "Marcador de página", "Acesso ao guia digital"],
      formato: "Físico · Frete calculado no checkout",
      preco: 89,
      precoDe: 119,
      parcelas: 6,
      checkout: "",
      capa: "pergaminho"
    }
  ],

  // Combo com todos os ebooks (aparece se houver 2+ ebooks).
  combo: {
    ativo: true,
    titulo: "Biblioteca Completa",
    subtitulo: "Todos os ebooks do catálogo em um único acesso — e os próximos lançamentos também.",
    preco: 77,
    parcelas: 12,
    checkout: ""
  },

  // Isca digital: material gratuito em troca do contato (vai para a planilha).
  isca: {
    titulo: "Receba um capítulo grátis",
    subtitulo:
      "Deixe seu contato e receba agora o primeiro capítulo de “O Método Essencial” + conteúdos exclusivos que não vão para o feed.",
    botao: "Quero meu capítulo grátis",
    // Link do material entregue após o cadastro (PDF no Drive, por exemplo).
    linkMaterial: "",
    // Enviar a pessoa para um grupo/canal de WhatsApp após o cadastro (opcional).
    linkGrupo: ""
  },

  // ⚠️ EXEMPLO — substitua por depoimentos reais (com autorização) ou deixe a lista vazia.
  depoimentos: [
    { nome: "Depoimento de exemplo", detalhe: "Aluna do Método Essencial", texto: "Finalmente entendi por onde começar. Em duas semanas já tinha resultado que não tive em meses tentando sozinha." },
    { nome: "Depoimento de exemplo", detalhe: "Aluno da Formação Completa", texto: "Conteúdo direto, sem enrolação. Os encontros ao vivo fazem toda a diferença." },
    { nome: "Depoimento de exemplo", detalhe: "Preparatório Intensivo", texto: "O cronograma me deu clareza do que estudar em cada semana. Cheguei na prova tranquila." },
    { nome: "Depoimento de exemplo", detalhe: "Leitora da Rotina de Alta Performance", texto: "Mudou minha rotina. Simples de aplicar e muito bem explicado." }
  ],

  faq: [
    { p: "Como recebo o material?", r: "Logo após a confirmação do pagamento você recebe o acesso no e-mail cadastrado. No Pix e no cartão a liberação é imediata; no boleto, em até 2 dias úteis." },
    { p: "Posso ler no celular?", r: "Sim. Os ebooks são em PDF e abrem em qualquer celular, tablet ou computador. Os cursos têm área de membros que funciona no navegador e no app." },
    { p: "E se eu não gostar?", r: "Você tem 7 dias de garantia incondicional. Se não fizer sentido para você, basta pedir o reembolso e devolvemos 100% do valor." },
    { p: "O pagamento é seguro?", r: "Sim. O pagamento é processado pela plataforma de checkout, com criptografia. Nós não temos acesso aos dados do seu cartão." },
    { p: "Tenho alguma dúvida que não está aqui.", r: "Chama no WhatsApp pelo botão do canto da tela — a gente responde rapidinho." }
  ]
};
