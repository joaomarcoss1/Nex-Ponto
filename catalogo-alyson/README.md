# Catálogo · Alyson Barbosa

Catálogo premium de ebooks, cursos, preparatórios e produtos, pensado para o link da bio do Instagram (mobile primeiro) e para vender.

- **Sem build.** HTML, CSS e JS puros: carrega rápido até no navegador do Instagram.
- **Tudo editável em um arquivo:** `config.js` (produtos, preços, links, textos, FAQ, depoimentos).
- **Planilha de leads:** Google Sheets via Apps Script (`google-apps-script/Code.gs`), chamada pela função `api/lead.js`.

## O que foi feito para vender

| Recurso | Por quê |
|---|---|
| Faixa de benefícios + selo de garantia de 7 dias | Tira a objeção de risco logo de cara |
| Produto destaque com preço "de/por", % de desconto e parcelamento | Ancoragem de preço e parcela que cabe no bolso |
| Contagem regressiva (opcional, com data real) | Urgência sem enganar |
| Combo "Biblioteca Completa" com economia calculada | Aumenta o ticket médio |
| Filtros por categoria, cards com capa 3D animada | Navegação rápida no celular, visual premium |
| Ficha do produto (benefícios, para quem é, incluso) | Responde dúvidas antes do checkout |
| CTA fixo no rodapé (mobile) + botão de WhatsApp | O botão de compra está sempre à mão |
| Isca digital (capítulo grátis) → planilha | Capta quem ainda não vai comprar hoje |
| Lista de espera para produtos "em breve" → planilha | Pré-venda de lançamentos e turmas |
| UTMs repassadas ao checkout e salvas na planilha | Saber qual story/post vendeu |
| Cliques em "comprar" registrados (aba **Cliques**) | Medir interesse por produto |
| Meta Pixel opcional (ViewContent, InitiateCheckout, Lead) | Remarketing nos anúncios |
| Link direto pra um produto: `?p=id-do-produto` | Usar em stories/destaques |

## Passo a passo para colocar no ar

### 1. Editar o conteúdo
Abra `config.js` e troque:
- `marca`: Instagram, WhatsApp (só dígitos, com 55), e-mail, foto (`assets/foto.jpg`).
- `produtos`: título, descrição, preço, **link de checkout** (Hotmart, Kiwify, Eduzz…). Sem link, o botão abre o WhatsApp com a mensagem pronta.
- Capas: use `imagem: "/assets/capa.jpg"` (3:4) para a capa real do ebook, ou deixe a capa gerada pelas cores.
- Tudo que está marcado como **EXEMPLO**, os números da prova social e os depoimentos: use só informação real.

### 2. Criar a planilha de leads
1. Crie uma planilha no Google Sheets.
2. **Extensões → Apps Script**, cole o conteúdo de `google-apps-script/Code.gs`.
3. Troque `SEGREDO` por uma senha longa.
4. **Implantar → Nova implantação → App da Web** · Executar como: *Eu* · Acesso: *Qualquer pessoa*.
5. Copie a URL que termina em `/exec`.

A planilha ganha as abas **Leads** (com link "Abrir conversa" no WhatsApp e coluna de status) e **Cliques**.

### 3. Publicar na Vercel
1. Vercel → **Add New → Project** → importe este repositório.
2. **Root Directory:** `catalogo-alyson` · Framework Preset: **Other** · sem comando de build.
3. **Environment Variables:**
   - `LEADS_WEBHOOK_URL` = URL `/exec` do passo 2
   - `LEADS_WEBHOOK_SECRET` = a senha do `SEGREDO`
4. Deploy. Depois, em **Settings → Domains**, dá para colocar um domínio próprio.
5. Cole a URL na bio do Instagram. Dica: use `?utm_source=instagram&utm_medium=bio`.

Enquanto as variáveis não estiverem configuradas, o formulário funciona e os leads ficam nos **logs** da Vercel (não se perdem). Depois de configurar, eles vão para a planilha.

## Rodar localmente
Qualquer servidor estático serve a página (`npx serve .`). Para testar o formulário com a função `api/`, use `npx vercel dev` dentro desta pasta.
