// Gera cartazes (PDF + PNG) e posts (PNG) da campanha CPA com o QR Code do questionário.
// Uso: node fonte/gerar_pecas.js   (requer Playwright/Chromium)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const qr = JSON.parse(fs.readFileSync(path.join(__dirname, 'qr-path.json'), 'utf8'));

const C = {
  verdeEsc: '#14532D', verde: '#6BAF2E', verdeClaro: '#B5D334',
  amarelo: '#F6B21A', laranja: '#EE6B23', vermelho: '#E04E26', azul: '#1D5BAA',
  texto: '#2B2F2C', fundo: '#FBFAF6',
};

// ---------- componentes ----------
const qrSvg = (color = C.verdeEsc) => `
<svg viewBox="-0.5 -0.5 ${qr.n + 1} ${qr.n + 1}" shape-rendering="crispEdges" style="width:100%;height:100%;display:block">
  <rect x="-0.5" y="-0.5" width="${qr.n + 1}" height="${qr.n + 1}" fill="#fff"/>
  <path d="${qr.d}" fill="${color}"/>
  <g transform="translate(${qr.n / 2} ${qr.n / 2})">
    <rect x="-6.2" y="-4" width="12.4" height="8" rx="1.6" fill="#fff"/>
    <rect x="-5.4" y="-3.2" width="10.8" height="6.4" rx="1.1" fill="${C.verdeEsc}"/>
    <text x="0" y="1.55" text-anchor="middle" font-family="Inter" font-weight="900" font-size="4.4" fill="#fff" letter-spacing="-0.1">CPA</text>
  </g>
</svg>`;

// Marca IPEDE (versão vetorial aproximada — substitua pela logo oficial se desejar)
const petals = [
  [-80, C.verdeEsc, 1.0], [-45, C.verde, 0.9], [-12, C.verdeClaro, 0.85],
  [20, C.verdeClaro, 0.7], [50, C.amarelo, 0.85], [85, C.laranja, 0.95], [120, C.laranja, 0.75],
];
const logo = (h = 60, textColor = C.verdeEsc) => `
<svg height="${h}" viewBox="0 0 330 100" style="display:block;overflow:visible">
  <text x="0" y="76" font-family="Inter" font-weight="900" font-size="80" letter-spacing="-3" fill="${textColor}">IPEDE</text>
  <g transform="translate(262 50)">
    ${petals.map(([a, c, s]) => `<path transform="rotate(${a}) scale(${s})" d="M6 0 L38 -9 L66 0 L38 9 Z" fill="${c}"/>`).join('')}
  </g>
</svg>`;

const shapes = (variant = 'a') => {
  const t = (style, color, clip) => `<div class="shape" style="${style};background:${color};clip-path:${clip}"></div>`;
  if (variant === 'a') return `
    ${t('top:0;right:0;width:34%;height:22%', C.verdeEsc, 'polygon(40% 0,100% 0,100% 55%)')}
    ${t('top:0;right:0;width:34%;height:22%', C.verdeClaro, 'polygon(20% 0,55% 0,100% 70%,100% 95%)')}
    ${t('top:2%;right:2%;width:14%;height:10%', C.amarelo, 'polygon(0 30%,100% 100%,40% 100%)')}
    ${t('top:0;left:0;width:22%;height:12%', C.laranja, 'polygon(0 0,100% 0,0 100%)')}
    ${t('top:0;left:0;width:26%;height:14%', C.verde, 'polygon(0 0,35% 0,0 70%)')}
    ${t('bottom:0;left:0;width:26%;height:10%', C.verdeEsc, 'polygon(0 20%,100% 100%,0 100%)')}
    ${t('bottom:0;left:0;width:26%;height:10%', C.amarelo, 'polygon(0 60%,55% 100%,0 100%)')}
    ${t('bottom:0;right:0;width:26%;height:10%', C.laranja, 'polygon(100% 0,100% 100%,20% 100%)')}
    ${t('bottom:0;right:0;width:26%;height:10%', C.verde, 'polygon(100% 45%,100% 100%,55% 100%)')}`;
  return `
    ${t('top:0;left:0;width:30%;height:16%', C.verdeEsc, 'polygon(0 0,100% 0,0 80%)')}
    ${t('top:0;left:0;width:30%;height:16%', C.amarelo, 'polygon(0 0,45% 0,0 45%)')}
    ${t('top:0;right:0;width:26%;height:14%', C.laranja, 'polygon(0 0,100% 0,100% 100%)')}
    ${t('top:0;right:0;width:26%;height:14%', C.verdeClaro, 'polygon(50% 0,100% 0,100% 50%)')}
    ${t('bottom:0;right:0;width:28%;height:11%', C.verdeEsc, 'polygon(100% 0,100% 100%,0 100%)')}
    ${t('bottom:0;right:0;width:28%;height:11%', C.verde, 'polygon(100% 50%,100% 100%,45% 100%)')}
    ${t('bottom:0;left:0;width:22%;height:12%', C.laranja, 'polygon(0 0,100% 100%,0 100%)')}`;
};

const ico = {
  plan: '<path d="M7 3h8l4 4v14H7z M15 3v4h4 M10 11h6 M10 15h4"/>',
  people: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c0-3.3 2.7-5 6-5s6 1.7 6 5 M12 20c0-3.3 1.7-5 4-5 3.3 0 6 1.7 6 5"/>',
  form: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h1 M12 8h4 M8 12h1 M12 12h4 M8 16h1 M12 16h4"/>',
  chart: '<path d="M4 20V10 M10 20V4 M16 20v-7 M3 20h18"/>',
  bulb: '<path d="M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  scan: '<path d="M3 8V5a2 2 0 0 1 2-2h3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3 M7 12h10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  mega: '<path d="M3 10v4h3l7 4V6L6 10z M16 9a4 4 0 0 1 0 6 M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
};
const icon = (k, size, color = '#fff', sw = 1.9) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ico[k]}</svg>`;

const etapas = [
  ['plan', 'Planejamento', C.verdeEsc], ['people', 'Sensibilização', C.verde],
  ['form', 'Questionários', C.amarelo], ['chart', 'Análise dos resultados', C.laranja],
  ['bulb', 'Plano de melhorias', C.vermelho],
];
const etapasRow = (u) => `
<div class="etapas" style="gap:${u * 1.2}px">
  ${etapas.map(([k, l, c], i) => `
    <div class="etapa" style="width:${u * 11}px">
      <div class="bola" style="width:${u * 8}px;height:${u * 8}px;background:${c}">${icon(k, u * 4.2)}
        <span style="width:${u * 2.8}px;height:${u * 2.8}px;font-size:${u * 1.6}px;color:${c}">${i + 1}</span></div>
      <div class="rot" style="font-size:${u * 1.45}px;margin-top:${u * 0.9}px">${l}</div>
    </div>`).join('')}
</div>`;

const qrCard = (size, opts = {}) => {
  const pad = size * 0.07;
  return `
<div class="qrcard" style="padding:${pad}px;border-radius:${size * 0.08}px;${opts.shadow === false ? 'box-shadow:none;' : ''}">
  <div class="qrwrap" style="width:${size}px;height:${size}px">
    ${['tl', 'tr', 'bl', 'br'].map((p) => `<i class="corner ${p}" style="--s:${size * 0.13}px;--w:${size * 0.022}px"></i>`).join('')}
    <div style="position:absolute;inset:${size * 0.05}px">${qrSvg()}</div>
  </div>
  ${opts.label !== false ? `<div class="qrlabel" style="font-size:${size * 0.062}px;margin-top:${pad * 0.7}px">${icon('phone', size * 0.08, C.verdeEsc, 2.2)} Aponte a câmera do celular</div>` : ''}
</div>`;
};

const passos = (u, dir = 'row') => `
<div class="passos" style="flex-direction:${dir};gap:${u * 1.4}px">
  ${[['phone', 'Abra a câmera do celular'], ['scan', 'Aponte para o QR Code'], ['check', 'Responda e envie']]
    .map(([k, t], i) => `<div class="passo" style="gap:${u}px">
      <div class="pn" style="width:${u * 4.6}px;height:${u * 4.6}px">${icon(k, u * 2.6)}</div>
      <div style="font-size:${u * 1.55}px"><b style="color:${C.laranja}">${i + 1}.</b> ${t}</div></div>`).join('')}
</div>`;

const css = `
@font-face{font-family:Inter;src:local('Inter')}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${C.fundo}}
body{font-family:Inter,'DejaVu Sans',sans-serif;color:${C.texto};-webkit-font-smoothing:antialiased}
.page{position:relative;overflow:hidden;background:${C.fundo}}
.shape{position:absolute;pointer-events:none}
.content{position:relative;z-index:2;height:100%;display:flex;flex-direction:column;align-items:center}
.qrcard{background:#fff;box-shadow:0 14px 40px rgba(20,83,45,.18),0 0 0 3px ${C.verdeEsc}22;display:inline-flex;flex-direction:column;align-items:center}
.qrwrap{position:relative}
.corner{position:absolute;width:var(--s);height:var(--s);border:var(--w) solid ${C.laranja}}
.corner.tl{top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:20%}
.corner.tr{top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:20%}
.corner.bl{bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:20%}
.corner.br{bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:20%}
.qrlabel{font-weight:800;color:${C.verdeEsc};display:flex;align-items:center;gap:.4em;text-transform:uppercase;letter-spacing:.02em}
.etapas{display:flex;justify-content:center}
.etapa{display:flex;flex-direction:column;align-items:center;text-align:center}
.bola{border-radius:50%;display:flex;align-items:center;justify-content:center;position:relative}
.bola span{position:absolute;top:-4%;right:-4%;background:#fff;border-radius:50%;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.rot{font-weight:700;color:${C.verdeEsc};line-height:1.15}
.passos{display:flex}
.passo{display:flex;align-items:center;font-weight:600;color:${C.texto}}
.pn{border-radius:30%;background:${C.verdeEsc};display:flex;align-items:center;justify-content:center;flex:none}
.cpa{font-weight:900;letter-spacing:-.04em;line-height:.85}
.cpa .c{color:${C.verdeEsc}}.cpa .p{color:${C.verde}}.cpa .a{color:${C.amarelo}}
.pill{background:${C.verdeEsc};color:#fff;font-weight:800;border-radius:999px;display:inline-flex;align-items:center;text-transform:uppercase}
.rodape{font-weight:700;letter-spacing:.35em;color:#6b6f6c}
.hl{color:${C.laranja}}
`;

const doc = (w, h, body, unit = 'px') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${css} @page{size:${w}${unit} ${h}${unit};margin:0}</style></head>
<body><div class="page" style="width:${w}${unit};height:${h}${unit}">${body}</div></body></html>`;

const cpaWord = (fs) => `<div class="cpa" style="font-size:${fs}px"><span class="c">C</span><span class="p">P</span><span class="a">A</span></div>`;
const sub = (fs) => `<div style="font-size:${fs}px;font-weight:800;color:${C.verdeEsc};letter-spacing:-.01em">Comissão Própria de Avaliação</div>`;

// ---------- peças ----------
// Dimensões em px a 96 dpi (A4 = 794x1123, A3 = 1123x1587)
const pecas = [];

// 1) Cartaz A4 — QR CODE EM DESTAQUE
pecas.push({
  nome: 'cartazes/cartaz-A4-qrcode-destaque', w: 794, h: 1123, pdf: true, scale: 3,
  html: (w, h) => doc(w, h, `${shapes('a')}
  <div class="content" style="padding:64px 60px 40px">
    ${logo(54)}
    <div style="margin-top:26px;font-size:30px;font-weight:900;color:${C.verdeEsc};text-align:center;line-height:1.05;letter-spacing:-.02em">
      SUA OPINIÃO <span class="hl">TRANSFORMA</span><br>A NOSSA INSTITUIÇÃO</div>
    <div style="margin-top:12px;font-size:17px;text-align:center;color:#4a4f4b;max-width:560px;line-height:1.4">
      Responda ao questionário de <b>Autoavaliação Institucional</b> da CPA e ajude a identificar potencialidades, apontar fragilidades e planejar melhorias.</div>
    <div style="margin-top:30px">${qrCard(430)}</div>
    <div style="margin-top:30px">${passos(10)}</div>
    <div style="flex:1"></div>
    <div class="pill" style="font-size:19px;padding:14px 30px;gap:12px">${icon('mega', 26)} Participe da Autoavaliação Institucional</div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:14px">${cpaWord(26)}<div style="font-size:13px;font-weight:700;color:${C.verdeEsc}">Comissão Própria de Avaliação</div>
      <div class="rodape" style="font-size:12px;margin-left:12px">SINAES • INEP • MEC</div></div>
  </div>`),
});

// 2) Cartaz A3 — completo (informativo + QR)
pecas.push({
  nome: 'cartazes/cartaz-A3-completo', w: 1123, h: 1587, pdf: true, scale: 2.5,
  html: (w, h) => doc(w, h, `${shapes('b')}
  <div class="content" style="padding:90px 90px 50px;align-items:stretch">
    <div style="display:flex;align-items:center;gap:36px">
      ${logo(78)}<div style="width:3px;height:150px;background:${C.verdeEsc}33"></div>
      <div><div style="font-size:42px;font-weight:900;color:${C.verdeEsc};letter-spacing:-.02em">CONHEÇA A</div>${cpaWord(150)}${sub(28)}</div>
    </div>
    <div style="margin-top:40px;font-size:25px;line-height:1.45;color:#3d423e;max-width:900px">
      A CPA, instituída pelo <b>SINAES</b>, realiza a autoavaliação institucional para melhorar a qualidade do ensino, da pesquisa e da extensão.
      <b style="color:${C.verdeEsc}">Sua participação</b> contribui para conhecer a realidade da Instituição, identificar potencialidades, apontar fragilidades e planejar melhorias.</div>
    <div style="margin-top:46px">${etapasRow(17)}</div>
    <div style="margin-top:50px;display:flex;align-items:center;gap:56px;background:#fff;border-radius:40px;padding:44px 50px;box-shadow:0 14px 40px rgba(20,83,45,.12);border:3px solid ${C.verde}55">
      ${qrCard(420, { label: false, shadow: false })}
      <div style="flex:1">
        <div style="font-size:24px;font-weight:800;color:${C.laranja};text-transform:uppercase;letter-spacing:.04em">Questionário CPA</div>
        <div style="font-size:52px;font-weight:900;color:${C.verdeEsc};line-height:1.02;letter-spacing:-.02em;margin:10px 0 30px">Escaneie e<br>responda agora!</div>
        ${passos(14, 'column')}
      </div>
    </div>
    <div style="flex:1"></div>
    <div style="text-align:center"><div class="pill" style="font-size:30px;padding:22px 48px;gap:18px">${icon('mega', 40)} Participe da Autoavaliação Institucional</div></div>
    <div class="rodape" style="text-align:center;font-size:18px;margin-top:22px">SINAES • INEP • MEC</div>
  </div>`),
});

// 3) Folha A4 com 4 cartões (A6) para mesas / portas / murais
const cartao = () => `
<div style="position:relative;width:397px;height:561px;overflow:hidden;background:${C.fundo};border:1px dashed #b9b9b9">
  ${shapes('a')}
  <div class="content" style="padding:36px 26px 20px">
    ${logo(30)}
    <div style="margin-top:12px;font-size:21px;font-weight:900;color:${C.verdeEsc};text-align:center;line-height:1.08">RESPONDA AO<br><span class="hl">QUESTIONÁRIO DA CPA</span></div>
    <div style="margin-top:16px">${qrCard(250)}</div>
    <div style="margin-top:14px;font-size:13px;text-align:center;color:#4a4f4b;line-height:1.35">Sua participação ajuda a construir<br>uma <b>instituição cada vez melhor!</b></div>
    <div style="flex:1"></div>
    <div class="rodape" style="font-size:9px">CPA • SINAES • INEP • MEC</div>
  </div>
</div>`;
pecas.push({
  nome: 'cartazes/cartoes-A6-recortar-4-por-folha-A4', w: 794, h: 1123, pdf: true, scale: 3,
  html: (w, h) => doc(w, h, `<div style="display:grid;grid-template-columns:397px 397px;grid-template-rows:561px 561px;background:#fff">${cartao() + cartao() + cartao() + cartao()}</div>`),
});

// 4) Post feed quadrado 1080x1080
pecas.push({
  nome: 'posts/post-feed-quadrado-1080x1080', w: 1080, h: 1080, scale: 1,
  html: (w, h) => doc(w, h, `${shapes('a')}
  <div class="content" style="padding:80px 80px 60px;flex-direction:row;align-items:center;gap:60px">
    <div style="flex:1;display:flex;flex-direction:column;gap:22px">
      ${logo(56)}
      <div style="font-size:30px;font-weight:900;color:${C.verdeEsc};margin-top:20px">CHEGOU A HORA DA</div>
      ${cpaWord(170)}${sub(25)}
      <div style="font-size:27px;line-height:1.35;color:#3d423e;margin-top:10px">Sua opinião ajuda a <b style="color:${C.laranja}">transformar</b> a nossa instituição.</div>
      <div class="pill" style="font-size:22px;padding:16px 28px;gap:12px;align-self:flex-start;margin-top:10px">${icon('mega', 28)} Participe!</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center">${qrCard(400)}</div>
  </div>
  <div class="rodape" style="position:absolute;bottom:40px;width:100%;text-align:center;font-size:17px;z-index:3">AUTOAVALIAÇÃO INSTITUCIONAL • SINAES • INEP • MEC</div>`),
});

// 5) Post feed retrato 1080x1350
pecas.push({
  nome: 'posts/post-feed-retrato-1080x1350', w: 1080, h: 1350, scale: 1,
  html: (w, h) => doc(w, h, `${shapes('b')}
  <div class="content" style="padding:110px 80px 60px">
    ${logo(62)}
    <div style="margin-top:34px;font-size:56px;font-weight:900;color:${C.verdeEsc};text-align:center;line-height:1.02;letter-spacing:-.02em">
      PARTICIPE DA<br><span class="hl">AUTOAVALIAÇÃO</span><br>INSTITUCIONAL</div>
    <div style="margin-top:44px">${qrCard(470)}</div>
    <div style="margin-top:44px">${etapasRow(10)}</div>
    <div style="flex:1"></div>
    <div class="rodape" style="font-size:18px">CPA • SINAES • INEP • MEC</div>
  </div>`),
});

// 6) Story / Status 1080x1920
pecas.push({
  nome: 'posts/story-status-1080x1920', w: 1080, h: 1920, scale: 1,
  html: (w, h) => doc(w, h, `${shapes('a')}
  <div class="content" style="padding:200px 80px 230px">
    ${logo(76)}
    <div style="margin-top:60px;font-size:40px;font-weight:900;color:${C.verdeEsc}">CONHEÇA A</div>
    ${cpaWord(230)}<div style="margin-top:14px">${sub(36)}</div>
    <div style="margin-top:40px;font-size:34px;text-align:center;line-height:1.35;color:#3d423e">Sua participação contribui para<br><b style="color:${C.verdeEsc}">planejar melhorias</b> para todos!</div>
    <div style="margin-top:60px">${qrCard(560)}</div>
    <div style="flex:1"></div>
    <div class="pill" style="font-size:30px;padding:24px 44px;gap:16px">${icon('mega', 38)} Responda o questionário</div>
  </div>`),
});

(async () => {
  const browser = await chromium.launch();
  for (const p of pecas) {
    const html = p.html(p.w, p.h);
    fs.writeFileSync(path.join(ROOT, p.nome + '.html'), html);
    const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: p.scale });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(ROOT, p.nome + '.png'), clip: { x: 0, y: 0, width: p.w, height: p.h } });
    if (p.pdf) await page.pdf({ path: path.join(ROOT, p.nome + '.pdf'), width: p.w + 'px', height: p.h + 'px', printBackground: true, pageRanges: '1' });
    await page.close();
    fs.unlinkSync(path.join(ROOT, p.nome + '.html'));
    console.log('ok', p.nome);
  }
  await browser.close();
})();
