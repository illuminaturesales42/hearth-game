"""Batch-15.1 plot-mask template — exact guide for generating map_island_plate.png.
Coords hand-synced with src/data/town-layout.ts (TOWN_BUILDINGS) + src/ui/map-view.ts (COASTLINE)."""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 2048, 1536
COAST = [
    (-0.08, 0.52), (0.05, 0.44), (0.14, 0.465), (0.26, 0.395), (0.38, 0.415),
    (0.52, 0.355), (0.64, 0.39), (0.76, 0.385), (0.88, 0.43), (1.02, 0.47),
    (1.09, 0.60), (1.04, 0.74), (0.90, 0.855), (0.80, 0.825), (0.68, 0.895),
    (0.55, 0.925), (0.42, 0.895), (0.30, 0.935), (0.16, 0.895), (0.04, 0.925), (-0.08, 0.80),
]
BUILDINGS = [
    (0.535, 0.56, 0.045, "Notice board"), (0.27, 0.52, 0.17, "Cottage"),
    (0.64, 0.485, 0.165, "Bakery"), (0.475, 0.635, 0.055, "Well"),
    (0.43, 0.44, 0.155, "Market"), (0.73, 0.66, 0.17, "Garden"),
    (0.505, 0.375, 0.185, "Town Hall"), (0.155, 0.43, 0.16, "Workshop"),
    (0.095, 0.635, 0.17, "Farm"), (0.865, 0.56, 0.165, "Fisher's Hut"),
    (0.21, 0.76, 0.165, "Sawmill"), (0.36, 0.72, 0.16, "Forge"),
    (0.79, 0.84, 0.21, "Docks"), (0.585, 0.74, 0.165, "Library"),
]
ROUTES = [
    [(0.47, 0.64), (0.36, 0.59), (0.27, 0.545)], [(0.475, 0.655), (0.46, 0.55), (0.44, 0.465)],
    [(0.44, 0.465), (0.505, 0.40)], [(0.27, 0.545), (0.17, 0.455)],
    [(0.13, 0.655), (0.24, 0.625), (0.36, 0.615), (0.47, 0.64)],
    [(0.49, 0.65), (0.62, 0.53), (0.72, 0.63), (0.84, 0.60)],
    [(0.36, 0.615), (0.30, 0.70), (0.335, 0.735)],
    [(0.52, 0.685), (0.66, 0.77), (0.78, 0.85)], [(0.52, 0.685), (0.575, 0.75)],
]


def p(q):
    return (q[0] * W, q[1] * H)


def coast(inset=0.0):
    cx, cy = 0.5 * W, 0.65 * H
    out = []
    for nx, ny in COAST:
        x, y = nx * W, ny * H
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 or 1
        k = 1 + inset / d
        out.append((cx + (x - cx) * k, cy + (y - cy) * k))
    return out


def fnt(sz):
    try:
        return ImageFont.truetype("arialbd.ttf", sz)
    except OSError:
        return ImageFont.load_default()


img = Image.new("RGB", (W, H), (110, 160, 190))
d = ImageDraw.Draw(img, "RGBA")
d.polygon(coast(90), fill=(140, 195, 205))
d.polygon(coast(40), fill=(205, 185, 140))
d.polygon(coast(0), fill=(150, 180, 120))
for r in ROUTES:
    d.line([p(q) for q in r], fill=(200, 178, 130, 220), width=26, joint="curve")
lx, ly = p((0.93, 0.5))
d.ellipse([lx - 90, ly - 90, lx + 90, ly + 90], outline=(200, 40, 40), width=8)
d.text((lx - 150, ly - 132), "LIGHTHOUSE\nKEEP CLEAR", fill=(160, 0, 0), font=fnt(34))
bx, by = p((0.79, 0.86))
d.ellipse([bx - 150, by - 70, bx + 150, by + 70], outline=(200, 40, 40), width=8)
d.text((bx - 130, by + 76), "DOCK BAY — KEEP CLEAR", fill=(160, 0, 0), font=fnt(30))
for x, y, w, label in BUILDINGS:
    cx, cy = p((x, y))
    rw, rh = w * W * 0.5, w * W * 0.3
    d.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], outline=(40, 40, 60), width=6)
    d.line([(cx, cy - 7), (cx, cy + 7)], fill=(40, 40, 60), width=4)
    d.line([(cx - 7, cy), (cx + 7, cy)], fill=(40, 40, 60), width=4)
    tw = d.textlength(label, font=fnt(30))
    d.rectangle([cx - tw / 2 - 6, cy - rh - 44, cx + tw / 2 + 6, cy - rh - 8], fill=(255, 255, 255, 220))
    d.text((cx - tw / 2, cy - rh - 42), label, fill=(20, 20, 40), font=fnt(30))
d.rectangle([0, 0, W, 100], fill=(20, 24, 40, 235))
d.text((28, 18), "EMBERHOLLOW — ISLAND PLATE PLOT MASK  (map_island_plate.png · 2048×1536 · opaque)",
       fill=(240, 236, 220), font=fnt(38))
d.text((28, 62), "Paint the island to THIS layout. Leave every dashed plot + red zone CLEAR (game draws "
       "buildings/boats/lighthouse/people on top). Warm golden-hour hand-painted storybook, Batch-1 style.",
       fill=(210, 205, 190), font=fnt(23))

scratch = os.path.dirname(__file__)
img.save(os.path.join(scratch, "plot_mask.png"))
print("saved plot_mask.png")
for dest in [r"C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Final Assets\Batch 15"]:
    try:
        os.makedirs(dest, exist_ok=True)
        img.save(os.path.join(dest, "PLOT_MASK_map_island_plate.png"))
        print("also saved to", dest)
    except OSError as e:
        print("could not save to Hearth folder (likely OneDrive/F: full):", e)
