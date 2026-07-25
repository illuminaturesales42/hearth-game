"""Offline map mock — composite the REAL sprites over the REAL plate using the
REAL layout data, so placement and progression can be judged without running
the game. Now also previews the living day:

  python tools/compose_map_mock.py out.png                  # full town, day
  python tools/compose_map_mock.py out.png --orders 12      # mid-restoration
  python tools/compose_map_mock.py out.png --phase night    # graded preview
  python tools/compose_map_mock.py out.png --layout v2      # staged V2 world
  python tools/compose_map_mock.py --sheet sheet.png        # 4 phases x 3 stages

State resolution mirrors the game: delivered < unlockAt -> own `_ruin` art (or
the generic town_ruin_<variant>); the next unlock -> `_wip`; else the built
sprite. Phase grading approximates the engine's land/sea grade (blue-dominance
sea mask, per-phase tints, lit-window dots at dusk/night) — a faithful preview,
not the renderer itself. Layout defaults to v2 when the imported V2 plates are
present in public/art, else v1.
"""

import os
import re
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "art")
LAYOUT = os.path.join(ROOT, "src", "data", "town-layout.ts")

SCALE = 3
W, H = 366 * SCALE, 315 * SCALE

src = open(LAYOUT, encoding="utf-8").read()


def const_num(name, default):
    m = re.search(rf"export const {name}\s*=\s*([\d.]+)", src)
    return float(m.group(1)) if m else default


PLATE_SCALE = const_num("BUILDING_PLATE_SCALE", 1.04)


def block(name):
    m = re.search(rf"export const {name}[^\[]*\[(.*?)\n\] as const", src, re.S)
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
        um = re.search(r"unlockAt:\s*(\d+)", obj)
        rv = re.search(r"ruinVariant:\s*(\d+)", obj)
        out.append({
            "art": am.group(1),
            "x": float(xm.group(1)),
            "y": float(ym.group(1)),
            "w": float(wm.group(1)),
            "unlockAt": int(um.group(1)) if um else 0,
            "ruinVariant": int(rv.group(1)) if rv else None,
            "water": "water: true" in obj,
            "until": int(re.search(r"untilStage:\s*(\d+)", obj).group(1)) if "untilStage" in obj else None,
        })
    return out


def load(art):
    p = os.path.join(ART, art + ".png")
    return Image.open(p).convert("RGBA") if os.path.exists(p) else None


def has(art):
    return os.path.exists(os.path.join(ART, art + ".png"))


def pick_layout(flag):
    if flag in ("v1", "v2"):
        return flag
    return "v2" if has("map_island_plate_dawn") else "v1"


def resolve_state(p, delivered, next_unlock):
    """The game's ladder: ruin -> wip (next in line) -> built."""
    if p["unlockAt"] <= delivered:
        return p["art"]
    own_wip, own_ruin = p["art"] + "_wip", p["art"] + "_ruin"
    if p["unlockAt"] == next_unlock and has(own_wip):
        return own_wip
    if has(own_ruin):
        return own_ruin
    if p["ruinVariant"] is not None:
        gen = ("town_wip_" if p["unlockAt"] == next_unlock else "town_ruin_") + str(p["ruinVariant"])
        if has(gen):
            return gen
    return None  # props with no ruin art wait until unlocked


def sea_mask(plate):
    """Blue-dominance water mask, feathered — same rule as the engine."""
    small = plate.resize((128, max(16, round(128 * plate.height / plate.width)))).convert("RGB")
    px = small.load()
    m = Image.new("L", small.size, 0)
    mp = m.load()
    for y in range(small.height):
        for x in range(small.width):
            r, g, b = px[x, y]
            if b > r * 1.12 and b > 70 and b + g > r * 1.9:
                mp[x, y] = 255
    return m.resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))


PHASES = {
    # land tint (multiply), land glow (screen, from side), sea tint (multiply), sea glow
    "dawn": {"land_mul": (216, 220, 244), "land_scr": ((255, 196, 165), "e", 0.30), "sea_mul": (232, 218, 226), "sea_scr": ((255, 178, 145), "e", 0.40)},
    "midday": None,
    "dusk": {"land_mul": (247, 208, 160), "land_scr": ((255, 176, 96), "w", 0.34), "sea_mul": (176, 164, 214), "sea_scr": ((255, 170, 80), "w", 0.5)},
    # deep twilight between dusk and night — ember cooling toward navy
    "evening": {"land_mul": (172, 158, 190), "land_scr": ((222, 158, 110), "w", 0.2), "sea_mul": (118, 118, 178), "sea_scr": ((236, 186, 130), "w", 0.3)},
    "night": {"land_mul": (108, 124, 178), "land_scr": ((150, 172, 226), "ne", 0.10), "sea_mul": (74, 92, 150), "sea_scr": ((196, 212, 238), "ne", 0.16)},
}


def tint_piece(img, phase):
    """Wash a phase-less sprite (boat, lighthouse, dressing) so it doesn't read
    as daytime when composited on a real dawn/dusk/night plate. Multiply-only,
    alpha preserved — a preview approximation of the engine's region grade."""
    from PIL import ImageChops

    col = {"dawn": (226, 202, 214), "dusk": (236, 178, 116), "evening": (168, 148, 172), "night": (92, 112, 168)}.get(phase)
    if col is None:
        return img
    r, g, b, a = img.split()
    rgb = ImageChops.multiply(Image.merge("RGB", (r, g, b)), Image.new("RGB", img.size, col))
    if phase == "night":
        rgb = ImageChops.multiply(rgb, Image.new("RGB", img.size, (150, 158, 188)))
    r2, g2, b2 = rgb.split()
    return Image.merge("RGBA", (r2, g2, b2, a))


def side_gradient(colour, side, peak):
    g = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(g)
    for i in range(W):
        t = i / W
        v = (1 - t) if side == "w" else t
        d.line([(i, 0), (i, H)], fill=int(255 * peak * max(0, v * 1.4 - 0.4)))
    if side == "ne":
        g = g.transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(40))
    return g


def grade(canvas, phase, glow_spots):
    if phase == "midday" or PHASES.get(phase) is None:
        return canvas
    cfg = PHASES[phase]
    plate = load("map_island_plate")
    mask = sea_mask(canvas if plate is None else plate.resize((W, H)))
    inv = Image.eval(mask, lambda v: 255 - v)
    out = canvas.convert("RGB")

    def masked_multiply(base, colour, m):
        tint = Image.new("RGB", (W, H), colour)
        mul = Image.composite(tint, Image.new("RGB", (W, H), (255, 255, 255)), m)
        from PIL import ImageChops

        return ImageChops.multiply(base, mul)

    out = masked_multiply(out, cfg["sea_mul"], mask)
    out = masked_multiply(out, cfg["land_mul"], inv)
    from PIL import ImageChops

    for key, m in (("land_scr", inv), ("sea_scr", mask)):
        colour, side, peak = cfg[key]
        grad = side_gradient(colour, side, peak)
        grad = Image.composite(grad, Image.new("L", (W, H), 0), m)
        layer = Image.new("RGB", (W, H), colour)
        out = ImageChops.screen(out, Image.composite(layer, Image.new("RGB", (W, H), (0, 0, 0)), grad))
    # lit windows: warm dots over each built building at dusk/night
    if phase in ("dusk", "evening", "night"):
        glow = Image.new("RGB", (W, H), (0, 0, 0))
        gd = ImageDraw.Draw(glow)
        k = 1.0 if phase == "night" else 0.75 if phase == "evening" else 0.45
        for gx, gy, gw in glow_spots:
            r = max(4, int(gw * 0.22))
            for rr, a in ((r, int(150 * k)), (int(r * 2.2), int(50 * k))):
                gd.ellipse([gx - rr, gy - rr, gx + rr, gy + rr], fill=(int(a), int(a * 0.75), int(a * 0.4)))
        glow = glow.filter(ImageFilter.GaussianBlur(6))
        out = ImageChops.screen(out, glow)
    # night vignette
    if phase == "night":
        v = Image.new("L", (W, H), 0)
        vd = ImageDraw.Draw(v)
        vd.ellipse([-W * 0.25, -H * 0.3, W * 1.25, H * 1.3], fill=90)
        v = v.filter(ImageFilter.GaussianBlur(80))
        out = ImageChops.multiply(out, Image.merge("RGB", [Image.eval(v, lambda a: 165 + int(a * 0.35))] * 3))
    return out.convert("RGBA")


def compose(out_path, layout, orders, phase):
    suffix = "_V2" if layout == "v2" else "_V1"
    buildings = parse_pieces(block("TOWN_BUILDINGS" + suffix))
    nature = parse_pieces(block("TOWN_NATURE" + suffix))
    terrain = parse_pieces(block("TOWN_TERRAIN" + suffix))
    boats = parse_pieces(block("TOWN_BOATS" + suffix))
    building_ids = {b["art"] for b in buildings}
    lighthouse = {"v1": (0.94, 0.59, 0.15), "v2": (0.82, 0.335, 0.13)}[layout]
    stage = 0 if orders == 0 else (2 if orders < 24 else 4)

    plate = load("map_island_plate")
    canvas = plate.resize((W, H), Image.LANCZOS).convert("RGBA") if plate else Image.new("RGBA", (W, H), (20, 40, 60, 255))
    # painted phase plate, full-strength, when it exists. When it does, the real
    # per-phase building sprites (lit windows at night, warm rims at dawn/dusk)
    # carry the look, so the crude procedural grade is skipped entirely.
    real_phase = False
    if phase == "evening":
        # evening has no plate of its own — it's a dusk-leaning blend of the dusk
        # and night plates (matches the game), so it sits between the two.
        base = canvas.copy()
        for pid, a in (("map_island_plate_dusk", 0.55), ("map_island_plate_night", 0.45)):
            pp = load(pid)
            if pp:
                d = pp.resize((W, H), Image.LANCZOS).convert("RGBA")
                d.putalpha(d.getchannel("A").point(lambda v, a=a: int(v * a)))
                base.alpha_composite(d)
        canvas = base
        real_phase = True
    elif phase != "midday":
        pp = load(f"map_island_plate_{phase}")
        if pp:
            canvas = pp.resize((W, H), Image.LANCZOS).convert("RGBA")
            real_phase = True

    upcoming = sorted(b["unlockAt"] for b in buildings if b["unlockAt"] > orders)
    next_unlock = upcoming[0] if upcoming else -1

    glow_spots = []
    pieces = []
    for p in terrain + nature:
        if p["until"] is not None and stage > p["until"]:
            continue
        pieces.append((p, p["art"]))
    for b in [x for x in boats if stage >= 2]:
        pieces.append((b, b["art"]))
    for p in buildings:
        art = resolve_state(p, orders, next_unlock)
        if art:
            pieces.append((p, art))
            if p["unlockAt"] <= orders and p["art"] in building_ids:
                pass
    # lighthouse ladder
    lx, ly, lw = lighthouse
    lh_art = "prop_lighthouse_ruin" if orders < 8 else ("prop_lighthouse_wip" if orders == 8 else ("prop_lighthouse_l2" if orders >= 20 else "prop_lighthouse"))
    pieces.append(({"art": lh_art, "x": lx, "y": ly, "w": lw, "unlockAt": 9, "water": True, "until": None, "ruinVariant": None}, lh_art))

    for p, art in sorted(pieces, key=lambda q: q[0]["y"]):
        draw_art, varianted = art, False
        eff_phase = "dusk" if phase == "evening" else phase  # evening leans dusk
        if real_phase and has(f"{art}_{eff_phase}"):
            draw_art, varianted = f"{art}_{eff_phase}", True
        img = load(draw_art) or load(art)
        if not img:
            continue
        scl = PLATE_SCALE if (p["art"] in building_ids or art.startswith("prop_lighthouse")) else 1.0
        w_px = p["w"] * W * scl
        h_px = w_px * (img.height / img.width)
        img2 = img.resize((max(1, int(w_px)), max(1, int(h_px))), Image.LANCZOS)
        # pieces without a painted phase variant (boats, lighthouse, dressing)
        # get a matching wash so they don't read as daytime on a dusk/night plate
        if real_phase and not varianted:
            img2 = tint_piece(img2, phase)
        px = int(p["x"] * W - w_px / 2)
        py = int(p["y"] * H - h_px)
        canvas.alpha_composite(img2, (px, py))
        if not real_phase and ((p["art"] in building_ids and p["unlockAt"] <= orders and not art.endswith(("_ruin", "_wip"))) or art in ("prop_lighthouse", "prop_lighthouse_l2")):
            glow_spots.append((p["x"] * W, p["y"] * H - h_px * 0.45, w_px))

    if not real_phase:
        canvas = grade(canvas, phase, glow_spots)
    canvas.convert("RGB").save(out_path)
    print(f"{out_path}  layout={layout} orders={orders} phase={phase} ({len(pieces)} pieces)")


def main():
    args = sys.argv[1:]
    flag = lambda name, default=None: (args[args.index(name) + 1] if name in args else default)
    layout = pick_layout(flag("--layout", "auto"))
    if "--sheet" in args:
        out = flag("--sheet")
        cells = []
        for orders in (0, 12, 72):
            for phase in ("dawn", "midday", "dusk", "night"):
                tmp = f"/tmp/mockcell_{orders}_{phase}.png"
                compose(tmp, layout, orders, phase)
                cells.append(Image.open(tmp))
        pad = 8
        sheet = Image.new("RGB", (4 * W + 5 * pad, 3 * H + 4 * pad), (15, 22, 38))
        for i, im in enumerate(cells):
            r, c = divmod(i, 4)
            sheet.paste(im, (pad + c * (W + pad), pad + r * (H + pad)))
        sheet.save(out)
        print("sheet ->", out)
        return
    out = args[0] if args and not args[0].startswith("--") else os.path.join(ROOT, "map_mock.png")
    compose(out, layout, int(flag("--orders", "72")), flag("--phase", "midday"))


if __name__ == "__main__":
    main()
