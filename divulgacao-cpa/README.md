# Divulgação CPA — Questionário de Autoavaliação Institucional

QR Code de acesso ao questionário:
`https://docs.google.com/forms/d/e/1FAIpQLSfXRAOZV4mDDEK4MOs6gA-pQzv2YmtCLGoJnbB6FZ-OWcskBg/viewform`

## Arquivos

| Arquivo | Uso | Impressão |
|---|---|---|
| `cartazes/cartaz-A4-qrcode-destaque.pdf` | **Cartaz com QR Code em destaque** para portas e murais das salas | A4, colorido |
| `cartazes/cartaz-A3-completo.pdf` | Cartaz informativo (o que é a CPA, etapas e QR Code) para corredores e murais | A3 (ou A4 reduzido) |
| `cartazes/cartoes-A6-recortar-4-por-folha-A4.pdf` | 4 cartões por folha para mesas, quadros e portas (linha tracejada = corte) | A4 |
| `posts/post-feed-quadrado-1080x1080.png` | Feed do Instagram/Facebook | — |
| `posts/post-feed-retrato-1080x1350.png` | Feed vertical (Instagram) | — |
| `posts/story-status-1080x1920.png` | Stories e status do WhatsApp | — |
| `qrcode/` | QR Code avulso (PNG verde, PNG preto e SVG vetorial) para outras peças | — |

Os PNGs dos cartazes também estão disponíveis para envio digital.

## Dicas de impressão
- Imprima em **100% / tamanho real** (sem "ajustar à página") para o QR Code não perder nitidez.
- No cartaz A4, o QR tem ~11 cm e é lido a até ~1 m. Para leitura de mais longe, imprima em A3.
- Evite papel brilhante sob luz forte (o reflexo atrapalha a câmera).

## Legendas sugeridas

**Feed:**
> 📢 Chegou a hora da Autoavaliação Institucional! A CPA quer ouvir você. Sua participação ajuda a conhecer a realidade da instituição, identificar potencialidades, apontar fragilidades e planejar melhorias. 📲 Aponte a câmera para o QR Code e responda o questionário!
> #CPA #IPEDE #AutoavaliaçãoInstitucional #SINAES

**WhatsApp:**
> Olá! 👋 A CPA está realizando a Autoavaliação Institucional e sua opinião é fundamental. Responda o questionário: https://docs.google.com/forms/d/e/1FAIpQLSfXRAOZV4mDDEK4MOs6gA-pQzv2YmtCLGoJnbB6FZ-OWcskBg/viewform

## Como regerar / editar
```bash
pip install qrcode pillow
python3 fonte/gerar_qrcode.py
node fonte/gerar_pecas.js   # requer Playwright + Chromium
```
Os textos e cores ficam em `fonte/gerar_pecas.js`. A marca IPEDE é uma versão vetorial aproximada — se tiver a logo oficial, substitua a função `logo()`.
