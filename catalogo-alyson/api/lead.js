// Função serverless da Vercel: recebe leads/cliques do catálogo e envia para a
// planilha do Google (via Apps Script). A URL da planilha fica em variável de
// ambiente — nunca exposta no navegador.
//
// Variáveis de ambiente (Vercel → Project → Settings → Environment Variables):
//   LEADS_WEBHOOK_URL     URL do App da Web do Google Apps Script (termina em /exec)
//   LEADS_WEBHOOK_SECRET  a mesma senha definida em SEGREDO no Code.gs

const hits = new Map();
const LIMITE = 12; // requisições por IP a cada 10 min
const JANELA = 10 * 60 * 1000;

function limitado(ip) {
  const agora = Date.now();
  const lista = (hits.get(ip) || []).filter((t) => agora - t < JANELA);
  lista.push(agora);
  hits.set(ip, lista);
  return lista.length > LIMITE;
}

const corta = (v, n = 200) => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
// Evita que um valor comece com = + - @ e vire fórmula na planilha.
const seguro = (v, n) => {
  const s = corta(v, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
};

async function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const partes = [];
  for await (const p of req) partes.push(p);
  return JSON.parse(Buffer.concat(partes).toString("utf8") || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ erro: "Método não permitido." });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (limitado(ip)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos." });

  let b;
  try {
    b = await lerCorpo(req);
  } catch {
    return res.status(400).json({ erro: "Dados inválidos." });
  }

  // Honeypot: robôs preenchem o campo escondido "site".
  if (b.site) return res.status(200).json({ ok: true });

  const tipo = b.tipo === "clique" ? "clique" : "lead";
  const registro = {
    tipo,
    data: new Date().toISOString(),
    nome: seguro(b.nome, 120),
    whatsapp: corta(b.whatsapp, 20).replace(/\D/g, ""),
    email: corta(b.email, 160).toLowerCase(),
    interesse: seguro(b.interesse, 80),
    origem: seguro(b.origem, 60),
    produto: seguro(b.produto, 160),
    produtoId: seguro(b.produtoId, 80),
    valor: Number(b.valor) || "",
    utm_source: seguro(b.utm_source, 80),
    utm_medium: seguro(b.utm_medium, 80),
    utm_campaign: seguro(b.utm_campaign, 120),
    utm_content: seguro(b.utm_content, 120),
    utm_term: seguro(b.utm_term, 120),
    pagina: corta(b.pagina, 300),
    referrer: corta(b.referrer, 300),
    dispositivo: corta(req.headers["user-agent"], 300)
  };

  if (tipo === "lead") {
    if (registro.nome.length < 2) return res.status(400).json({ erro: "Informe seu nome." });
    if (registro.whatsapp.length < 10) return res.status(400).json({ erro: "Informe um WhatsApp válido com DDD." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(registro.email)) return res.status(400).json({ erro: "Informe um e-mail válido." });
    if (b.consentimento !== true) return res.status(400).json({ erro: "É preciso aceitar receber os conteúdos." });
  }

  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) {
    // Ainda não configurado: não perde o lead em silêncio — fica nos logs da Vercel.
    console.warn("[lead] LEADS_WEBHOOK_URL não configurada. Registro:", JSON.stringify(registro));
    return res.status(200).json({ ok: true, armazenado: false });
  }

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ segredo: process.env.LEADS_WEBHOOK_SECRET || "", ...registro }),
      redirect: "follow"
    });
    const txt = await r.text();
    let j = {};
    try { j = JSON.parse(txt); } catch { /* Apps Script às vezes devolve HTML */ }
    if (!r.ok || j.ok === false) throw new Error(j.erro || "HTTP " + r.status);
    return res.status(200).json({ ok: true, armazenado: true });
  } catch (e) {
    console.error("[lead] falha ao gravar na planilha:", e.message, JSON.stringify(registro));
    return res.status(502).json({ erro: "Não conseguimos registrar agora. Tente de novo em instantes." });
  }
}
