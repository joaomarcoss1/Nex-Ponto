"""Gera o QR Code do questionário CPA (SVG + PNG) com correção de erro alta (H)."""
import pathlib, qrcode
from qrcode.image.svg import SvgPathImage

URL = "https://docs.google.com/forms/d/e/1FAIpQLSfXRAOZV4mDDEK4MOs6gA-pQzv2YmtCLGoJnbB6FZ-OWcskBg/viewform"
OUT = pathlib.Path(__file__).resolve().parent.parent / "qrcode"
VERDE = "#14532D"

def make(**kw):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=4, **kw)
    q.add_data(URL); q.make(fit=True)
    return q

q = make(box_size=40)
print("versão:", q.version, "módulos:", q.modules_count)
q.make_image(fill_color=VERDE, back_color="white").save(OUT / "qrcode-cpa-verde.png")
q.make_image(fill_color="black", back_color="white").save(OUT / "qrcode-cpa-preto.png")
make(box_size=10, image_factory=SvgPathImage).make_image().save(OUT / "qrcode-cpa.svg")

# matriz sem borda para os layouts (inline SVG)
m = make(box_size=1).get_matrix()
b = 4; m = [r[b:-b] for r in m[b:-b]]
n = len(m)
path = "".join(f"M{x},{y}h1v1h-1z" for y, r in enumerate(m) for x, v in enumerate(r) if v)
(OUT.parent / "fonte" / "qr-path.json").write_text(f'{{"n":{n},"d":"{path}"}}')
