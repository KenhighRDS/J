"""Cuts the RDS Academy logo out of its white background so it sits on the video's own background.
Usage: python3 scripts/prep-rds-logo.py <source.png>   ->   public/rds-logo.png (transparent, cropped)

White is removed by "colour to alpha": a pixel's opacity is how far it is from white, and edge pixels are un-mixed
from the white they were blended with, so there is no pale fringe. Solid colours inside the mark stay fully opaque."""
import sys
from pathlib import Path
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGB")
src = src.resize((src.width * 3, src.height * 3), Image.LANCZOS)   # the source is small: enlarge first so the cut edge stays smooth
w, h = src.size
out = Image.new("RGBA", (w, h))
sp, op = src.load(), out.load()
LO, HI = 205, 247            # min channel at or above HI is background; at or below LO is solid artwork
for y in range(h):
    for x in range(w):
        r, g, b = sp[x, y]
        m = min(r, g, b)
        if m >= HI:
            op[x, y] = (255, 255, 255, 0)
            continue
        a = 1.0 if m <= LO else (HI - m) / (HI - LO)
        if a < 1.0:                                   # an anti-aliased edge: take the white back out of the colour
            r, g, b = (max(0, min(255, round((c - (1 - a) * 255) / a))) for c in (r, g, b))
        op[x, y] = (r, g, b, round(a * 255))
box = out.getbbox()
pad = 24
box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
out = out.crop(box)
dest = Path(__file__).resolve().parent.parent / "public" / "rds-logo.png"
out.save(dest)
print("wrote", dest, out.size)
