"""Offline map-composition mock — composite the REAL sprites over the REAL plate
using the REAL layout data, so building placement can be iterated without running
the game. Parses src/data/town-layout.ts; renders the fully-restored town.

Faithful to the game's mapping: canvas is 366x285 (x is a fraction of width,
y of height, y = ground baseline), buildings in BUILDING_INFO draw at
BUILDING_PLATE_SCALE. We render at 3x for clarity.

Usage: python tools/compose_map_mock.py [out.png]
"""
import os
import re
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "art")
LAYOUT = os.path.join(ROOT, "src", "data", "town-layout.ts")

SCALE = 3
W, H = 366 * SCALE, 285 * SCALE

src = open(LAYOUT, encoding="utf-8").read()

def const_num(name, default):
    m = re.search(rf"export const {name}\s*=\s*([\d.]+)", src)
    return float(m.group(1)) if m else default

PLATE_SCALE = const_num("BUILDING_PLATE_SCALE", 1.04)

def block(name):
    m = re.search(rf"export const {name}[^\[]*\[(.*?)\n\] as const", src, re.S)
    if not m:
        m = re.search(rf"export const {name}[^\[]*\[(.*?)\n\];", src, re.S)
    return m.group(1) if m else ""

def parse_pieces(text):
    out = []
    for obj in re.findall(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text):
        am = re.search(r"art:\s*'([^']+)'", obj)
        xm = re.search(r"\bx:\s*(-?[\d.]+)", obj)
        ym = re.search(r"\by:\s*(-?[\d.]+)", obj)
        wm = re.search(r"\bw:\s*(-?[\d.]+)", obj)
        if not (am and xm and ym and wm):
            continue
        out.append({
            "art": am.group(1),
            "x": float(xm.group(1)),
            "y": float(ym.group(1)),
            "w": float(wm.group(1)),
            "water": "water: true" in obj,
            "until": int(re.search(r"untilStage:\s*(\d+)", obj).group(1)) if "untilStage" in obj else None,
        })
    return out

buildings = parse_pieces(block("TOWN_BUILDINGS"))
nature = parse_pieces(block("TOWN_NATURE"))
terrain = parse_pieces(block("TOWN_TERRAIN"))
boats = parse_pieces(block("TOWN_BOATS"))
building_ids = {b["art"] for b in buildings}

# Lighthouse is special-cased in map-view (not in the layout array).
LIGHTHOUSE = {"art": "prop_lighthouse_l2", "x": 0.94, "y": 0.59, "w": 0.15, "water": True, "special": True}

def load(art):
    p = os.path.join(ART, art + ".png")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None

def compose(out_path):
    plate = load("map_island_plate")
    canvas = plate.resize((W, H), Image.LANCZOS).convert("RGBA") if plate else Image.new("RGBA", (W, H), (20, 40, 60, 255))

    # Flat terrain/nature under buildings, then everything y-sorted.
    flat = [p for p in terrain if p["until"] is None]
    uprights = [p for p in (nature + boats + buildings) if p["until"] is None or p["until"] >= 4]
    uprights.append(LIGHTHOUSE)

    def draw(p):
        img = load(p["art"])
        if not img:
            return
        scale = PLATE_SCALE if (p["art"] in building_ids or p.get("special")) else 1.0
        w_px = p["w"] * W * scale
        h_px = w_px * (img.height / img.width)
        img2 = img.resize((max(1, int(w_px)), max(1, int(h_px))), Image.LANCZOS)
        px = int(p["x"] * W - w_px / 2)
        py = int(p["y"] * H - h_px)
        canvas.alpha_composite(img2, (px, py))

    for p in flat:
        draw(p)
    for p in sorted(uprights, key=lambda q: q["y"]):
        draw(p)

    canvas.convert("RGB").save(out_path)
    print(f"{out_path}  ({len(uprights)} uprights, {len(flat)} flat, plate_scale={PLATE_SCALE})")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "map_mock.png")
    compose(out)
