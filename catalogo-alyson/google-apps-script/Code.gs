/**
 * PLANILHA DE LEADS — Google Apps Script
 * ------------------------------------------------------------
 * 1. Crie uma planilha no Google Sheets (ex.: "Leads · Catálogo Alyson").
 * 2. Menu Extensões → Apps Script. Apague o conteúdo e cole ESTE arquivo.
 * 3. Troque o valor de SEGREDO abaixo por uma senha longa qualquer.
 * 4. Clique em Implantar → Nova implantação → tipo "App da Web".
 *      Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 * 5. Autorize, copie a URL que termina em /exec.
 * 6. Na Vercel, crie as variáveis:
 *      LEADS_WEBHOOK_URL    = a URL /exec
 *      LEADS_WEBHOOK_SECRET = a mesma senha do SEGREDO
 *    e faça um novo deploy (Deployments → Redeploy).
 *
 * As abas "Leads" e "Cliques" são criadas sozinhas no primeiro envio.
 */

var SEGREDO = "TROQUE-POR-UMA-SENHA-LONGA";

var COLUNAS_LEADS = [
  ["data", "Data/Hora"], ["nome", "Nome"], ["whatsapp", "WhatsApp"], ["email", "E-mail"],
  ["interesse", "Interesse"], ["origem", "Origem"], ["produto", "Produto"],
  ["utm_source", "UTM Source"], ["utm_medium", "UTM Medium"], ["utm_campaign", "UTM Campanha"],
  ["utm_content", "UTM Conteúdo"], ["referrer", "Veio de"], ["pagina", "Página"], ["dispositivo", "Dispositivo"],
  ["_link", "Chamar no WhatsApp"], ["_status", "Status"]
];

var COLUNAS_CLIQUES = [
  ["data", "Data/Hora"], ["produto", "Produto"], ["produtoId", "ID"], ["valor", "Valor (R$)"],
  ["utm_source", "UTM Source"], ["utm_campaign", "UTM Campanha"], ["pagina", "Página"], ["dispositivo", "Dispositivo"]
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.segredo !== SEGREDO) return json({ ok: false, erro: "não autorizado" });

    lock.waitLock(10000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ehClique = d.tipo === "clique";
    var cols = ehClique ? COLUNAS_CLIQUES : COLUNAS_LEADS;
    var aba = garantirAba(ss, ehClique ? "Cliques" : "Leads", cols);

    d.data = d.data ? new Date(d.data) : new Date();
    if (!ehClique) {
      var fone = String(d.whatsapp || "").replace(/\D/g, "");
      if (fone && fone.length <= 11) fone = "55" + fone;
      d._link = fone ? '=HYPERLINK("https://wa.me/' + fone + '","Abrir conversa")' : "";
      d._status = "Novo";
      if (d.whatsapp) d.whatsapp = "'" + d.whatsapp; // mantém zeros e evita notação científica
    }

    aba.appendRow(cols.map(function (c) { return d[c[0]] == null ? "" : d[c[0]]; }));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() {
  return json({ ok: true, info: "Endpoint de leads ativo." });
}

function garantirAba(ss, nome, cols) {
  var aba = ss.getSheetByName(nome);
  if (aba) return aba;
  aba = ss.insertSheet(nome);
  var titulos = cols.map(function (c) { return c[1]; });
  aba.getRange(1, 1, 1, titulos.length).setValues([titulos])
    .setFontWeight("bold").setBackground("#16130f").setFontColor("#f1dca7");
  aba.setFrozenRows(1);
  aba.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  if (nome === "Leads") {
    var regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Novo", "Em conversa", "Comprou", "Sem interesse"], true).build();
    aba.getRange(2, titulos.length, 2000, 1).setDataValidation(regra);
  }
  aba.autoResizeColumns(1, titulos.length);
  return aba;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Rode uma vez pelo editor (▶ Executar) para testar a gravação. */
function testar() {
  doPost({ postData: { contents: JSON.stringify({
    segredo: SEGREDO, tipo: "lead", nome: "Teste", whatsapp: "11999999999",
    email: "teste@exemplo.com", interesse: "Ebooks", origem: "teste"
  }) } });
}
