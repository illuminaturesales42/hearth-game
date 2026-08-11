"""
Extend the player-portrait catalogue with the faces it is missing.

The shipped catalogue is 288 portraits (12 faces x 4 skin tones x 6 hairstyles)
and every one of them is white European, Black African, or an ambiguous tan in
between. There is no East Asian, South-East Asian or South Asian face in it.

That is not a rendering accident, it is what the spec asks for. Read
docs/avatar-modular-catalogue.md: the twelve base faces are described purely
morphologically ("round face, high cheekbones, warm hazel eyes") and the only
ethnic signal in the whole prompt is a skin-tone clause. Give SDXL a face with
no stated ethnicity and it returns a white European one; weight a "bronzed tan
brown skin" clause onto that and you get a tanned white person, not an Asian
one. Skin tone is not ethnicity, and the catalogue treats it as though it were.

The hair axis compounds it. All six styles are curly updo / cropped / braid /
wavy / coils / capped — not one straight-hair option in the set, and straight
hair is a strong read for East Asian faces.

So this adds, rather than replaces: four new base characters that state their
ethnicity explicitly, and two straight-hair styles. Nothing existing is
re-rendered, which matters because portrait ids are persisted in player saves —
regenerating character 03 would silently change the face of anyone already
wearing it.

RECIPE IS LOCKED AND NOT MINE TO CHOOSE. Every constant below was read back out
of the PNG metadata of a shipped portrait rather than reconstructed from the
docs, because the docs are already out of date in two places (they say seed 777 /
steps 32 / 512x512 txt2img and make no mention of the IPAdapter that is actually
doing the style work). To re-extract after any future change:

    python -c "from PIL import Image; import json; \
      print(json.dumps(json.loads(Image.open( \
      r'public/art/avatar_c03_skin2_hair05.png').info['prompt']), indent=2))"

Usage (ComfyUI venv interpreter):
    ...python.exe tools/comfy_avatar.py --audit        # sheet of what exists now
    ...python.exe tools/comfy_avatar.py --validate     # 8 faces, ~3 min, judge first
    ...python.exe tools/comfy_avatar.py --all          # the full 128
    ...python.exe tools/comfy_avatar.py --chars 13,14  # a subset
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
OUT = REPO / "tools" / "comfy_out" / "avatar"
SERVER = "127.0.0.1:8188"

CKPT = "RealVisXL_V5.0.safetensors"
STYLE_REF = "char_bran_bust_ref.png"      # a villager bust; carries the painterly register
IPA_MODEL = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
IPA_WEIGHT = 0.3
RENDER = 1024                              # latent size
SAVE = 512                                 # shipped size, downscaled with lanczos

# {who} is the subject noun. The original 288 hard-code "person" here and put the
# gender word at the head of {face}; that slot is the only place an ethnicity term
# actually survives (see PROBES), so it is parameterised instead.
POSITIVE = (
    "cosy storybook character portrait, hand-painted digital illustration, "
    "chest-up bust of a {skin} {who}, {face}, {hair}, warm painterly brushwork, "
    "visible brushstrokes, gentle warm rim light from upper left, muted earthy "
    "old-seaside colour palette, driftwood brown cream sage muted teal rust, "
    "Emberhollow fishing village resident, plain cream parchment background, "
    "single figure centred, face in upper third of frame, consistent lighting, "
    "children's book illustration style, warm and welcoming expression, "
    # Added on top of the locked prompt. Only 3 of the 12 shipped compositions
    # gave a new face any headroom — the rest put the hair against the top edge,
    # which is the "cropped too tight" complaint. "face in upper third of frame"
    # invites a large head, so the framing has to be stated as well as the
    # placement. This does not change the style, only how much of the figure fits.
    "(wide bust framing, small head, clear empty space above the head, both "
    "shoulders and upper chest fully inside the frame:1.3)"
)
NEGATIVE = (
    "photorealistic, photograph, 3d render, anime, manga, harsh outlines, cel "
    "shaded, high saturation, neon, modern streetwear, logos, text, watermark, "
    "frame, border, busy background, scene clutter, extra limbs, deformed, "
    "uncanny, low quality, blurry, cropped, multiple people, full body, sun, "
    "sunset, sunrise, sunburst, halo, glow behind head, ocean, sea, water, boat, "
    "ship, landscape, scenery, horizon, sky, clouds, outdoor scene, "
    # Seen in the first new draws and not in the shipped set: painted leaves
    # behind the shoulders, a coloured studio backdrop, and a chin-cropped
    # head filling the frame.
    "foliage, leaves, plants, branches, flowers, painted backdrop, coloured "
    "background, vignette, extreme close-up, headshot, face filling the frame, "
    "cropped chin, cropped forehead, cropped hair"
)

SKIN = {
    1: "(pale fair skin:1.4)",
    2: "(warm medium-tan skin:1.4)",
    3: "(bronzed tan brown skin:1.4)",
    4: "(deep dark brown skin:1.4)",
}
HAIR = {
    1: "curly updo",
    2: "short cropped hair",
    3: "long braid",
    4: "wavy shoulder-length hair",
    5: "tight coils",
    6: "flat cap covering hair",
    # NEW. The existing six have no straight option at all, which is part of why
    # no amount of skin-tone tuning produced a credible East Asian portrait.
    7: "long straight black hair",
    8: "straight blunt bob",
}

# (role label, subject noun, morphology). Morphology matches the original
# driver's register — see batch_avatar_catalogue.py FACES, whose entries the docs
# table transcribes without their leading gender word.
#
# WHERE the ethnicity sits is the whole problem, and it took three attempts and a
# four-way probe to establish that position beats vocabulary:
#
#   1.45, clinical, trailing — "(East Asian features, epicanthic folds, monolid
#     almond eyes:1.45)". The ethnicity landed unmistakably and destroyed the
#     style with it: at 1.45 the clause outranked every other term including
#     "hand-painted digital illustration", and clinical anatomy vocabulary reads
#     to the model as medical or photographic reference. Out came a photoreal
#     head-only close-up with a flat affect.
#   1.3, plain, trailing — "woman, (East Asian:1.3), oval face...". Style
#     perfect, ethnicity gone entirely: all four faces read white European.
#   nationality, trailing — "(Japanese woman:1.3)" appended. Still white
#     European, and so was the same prompt with the skin weight cut to 1.1.
#
# The trailing position simply cannot win against "(pale fair skin:1.4)" sitting
# ahead of it, no matter the word or the weight. Moving the ethnicity into the
# SUBJECT NOUN gets both: a clearly East Asian face and the painted register
# intact. Hence {who}.
NEW_FACES: dict[int, tuple[str, str, str]] = {
    13: ("Weaver", "(East Asian woman:1.35)",
         "oval face, high flat cheekbones, soft almond eyes, calm warm expression"),
    14: ("Netmender", "(East Asian man:1.35)",
         "older, square face, broad cheekbones, deep smile lines, kind steady gaze, "
         "grey hair"),
    15: ("Cook", "(Southeast Asian man:1.35)",
         "(young man in his twenties:1.2), soft round face, wide-set eyes, broad nose, "
         "bright open smile, dark hair"),
    16: ("Apothecary", "(South Asian woman:1.35)",
         "long oval face, strong dark brows, large dark eyes, warm thoughtful expression"),
}
SKINS = (1, 2, 3, 4)
HAIRS = (1, 2, 3, 4, 5, 6, 7, 8)

# Composition is inherited, not re-rolled. The brief is "identical to the ones we
# already have, just new avatars", and with prompt, negative and IPAdapter all
# fixed, the seed is what decides framing, background and pose — so a new seed
# means a new composition, and new compositions came out variously cropped to the
# chin or backed by painted foliage.
#
# These four are the cleanest in the shipped set, chosen by measuring rather than
# by eye (border-ring colour variance for background plainness, subject area for
# crop tightness, and the topmost subject row for headroom):
#
#     char   bg_var   fill    top
#     c11      0.95   0.345  0.061
#     c09      2.26   0.400  0.064
#     c07     10.89   0.519  0.035
#     c03     30.04   0.520  0.055
#
# The rest of the catalogue runs fill 0.65-0.79 at top 0.000 — figures that touch
# the frame edge. Borrowing a good seed keeps the composition and lets {who}
# change the face, which is exactly the intended split. Gender is matched to the
# borrowed composition.
# Chosen by --pick-seed, which renders a character against every shipped seed
# and scores the result. With the framing clause in place four compositions
# pass for a new face (1030, 1050, 1070, 1110); before it, only three did,
# and fresh seeds outside the shipped set failed every time.
#   c13  1030 PASS  1110 PASS                        -> 1110
#   c14  1030 PASS  1050 PASS  1070 PASS             -> 1050
#   c15  1070 PASS                                   -> 1070
#   c16  1030 PASS  1050 PASS  1070 PASS  1110 PASS  -> 1030
# Assigned so all four pass with no two sharing a pose; 1030 goes to c16
# because it is that character's only strong draw.
COMPOSITION_SEED = {13: 1110, 14: 1050, 15: 1070, 16: 1030}

# Measured envelope of those four references, used to flag a bad draw instead of
# trusting 128 renders to eyeball.
QC = {"bg_var": 40.0, "fill": (0.26, 0.62), "top": 0.020}


# Candidate phrasings for the one hard question in this whole job: how to state
# ethnicity so it survives "(pale fair skin:1.4)" without flattening the painted
# style. Two attempts already failed in opposite directions (see NEW_FACES), and
# the difference between them is phrasing and position, not weight — so they get
# rendered side by side rather than argued about.
PROBES: dict[str, tuple[str, str]] = {
    # subject-slot: ethnicity becomes the head noun instead of a trailing clause
    "noun": ("chest-up bust of a {skin} (East Asian woman:1.35), {face}, {hair}",
             "oval face, high flat cheekbones, soft almond eyes, calm warm expression"),
    # ethnicity first, skin demoted to a modifier of it
    "leading": ("chest-up bust of an (East Asian woman:1.3) with {skin} skin tone, {face}, {hair}",
                "oval face, high flat cheekbones, soft almond eyes, calm warm expression"),
    # nationality words are far stronger tokens in SDXL than "East Asian", and
    # read as ordinary description rather than anatomy. Prompt-side only — the
    # player-facing label stays "Weaver".
    "nationality": ("chest-up bust of a {skin} person, {face}, {hair}",
                    "(Japanese woman:1.3), oval face, high flat cheekbones, soft almond "
                    "eyes, calm warm expression"),
    # as above but with the skin weight dropped, to see how much of the fight is
    # simply the 1.4 on the tone
    "soft-skin": ("chest-up bust of a (pale fair skin:1.1) person, {face}, {hair}",
                  "(Japanese woman:1.3), oval face, high flat cheekbones, soft almond "
                  "eyes, calm warm expression"),
}


def probe(dest: Path) -> Path:
    """Render each candidate phrasing for character 13 at pale skin — the hardest
    combination, since pale skin is what most strongly pulls the face European."""
    head, tail = POSITIVE.split("chest-up bust of a {skin} {who}, {face}, {hair}, ")
    cells = []
    for name, (subject, face) in PROBES.items():
        positive = head + subject.format(skin=SKIN[1], face=face, hair=HAIR[2]) + ", " + tail
        out = OUT / f"_probe_{name}.png"
        try:
            out.write_bytes(queue_and_wait(build_graph(positive, seed_for(13), f"probe_{name}")))
        except (RuntimeError, TimeoutError, urllib.error.URLError, OSError) as e:
            print(f"  probe {name} FAILED: {e}")
            continue
        print(f"  probe {name}")
        cells.append((name, out))
    return sheet(cells, dest, cols=len(cells) or 1) if cells else dest


def seed_for(character: int) -> int:
    """Identical across a character's variants so the face stays recognisable.

    The catalogue's own rule is 1000 + character*10. New characters instead
    inherit a reference composition's seed (see COMPOSITION_SEED) so their
    framing and background match the shipped set.
    """
    return COMPOSITION_SEED.get(character, 1000 + character * 10)


def build_graph(positive: str, seed: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": RENDER, "height": RENDER, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 32, "cfg": 7.0, "sampler_name": "dpmpp_2m",
            "scheduler": "karras", "denoise": 1.0,
            "model": ["13", 0], "positive": ["2", 0], "negative": ["3", 0],
            "latent_image": ["4", 0]}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "8": {"class_type": "LoadImage", "inputs": {"image": STYLE_REF}},
        "9": {"class_type": "ImageScale", "inputs": {
            "image": ["6", 0], "upscale_method": "lanczos",
            "width": SAVE, "height": SAVE, "crop": "disabled"}},
        "11": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPA_MODEL}},
        "12": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}},
        "13": {"class_type": "IPAdapterAdvanced", "inputs": {
            "weight": IPA_WEIGHT, "weight_type": "style transfer", "combine_embeds": "concat",
            "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only",
            "model": ["1", 0], "ipadapter": ["11", 0], "image": ["8", 0],
            "clip_vision": ["12", 0]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefix}},
    }


def queue_and_wait(graph: dict, timeout: float = 300.0) -> bytes:
    req = urllib.request.Request(
        f"http://{SERVER}/prompt", data=json.dumps({"prompt": graph}).encode(),
        headers={"Content-Type": "application/json"})
    pid = json.loads(urllib.request.urlopen(req, timeout=30).read())["prompt_id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        with urllib.request.urlopen(f"http://{SERVER}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read())
        if pid in hist:
            entry = hist[pid]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"comfy error: {json.dumps(status)[:400]}")
            for node in entry.get("outputs", {}).values():
                for img in node.get("images", []):
                    q = urllib.parse.urlencode(
                        {"filename": img["filename"], "subfolder": img.get("subfolder", ""),
                         "type": img.get("type", "output")})
                    with urllib.request.urlopen(f"http://{SERVER}/view?{q}", timeout=60) as v:
                        return v.read()
            raise RuntimeError("prompt finished with no image output")
        time.sleep(1.0)
    raise TimeoutError(f"prompt {pid} did not finish in {timeout:.0f}s")


def measure(path: Path) -> dict:
    """Background plainness, subject fill and headroom — the three ways the new
    draws diverged from the shipped set."""
    import numpy as np

    a = np.array(Image.open(path).convert("RGB")).astype(float)
    h, w, _ = a.shape
    ring = np.concatenate([a[:14].reshape(-1, 3), a[-14:].reshape(-1, 3),
                           a[:, :14].reshape(-1, 3), a[:, -14:].reshape(-1, 3)])
    subj = np.abs(a - ring.mean(0)).sum(2) > 70
    ys = np.nonzero(subj.any(1))[0]
    return {"bg_var": float(ring.std(0).mean()), "fill": float(subj.mean()),
            "top": float(ys.min() / h) if len(ys) else 1.0}


def qc_fail(m: dict) -> str:
    lo, hi = QC["fill"]
    bad = []
    if m["bg_var"] > QC["bg_var"]:
        bad.append(f"busy background ({m['bg_var']:.0f})")
    if not lo <= m["fill"] <= hi:
        bad.append(f"{'tight crop' if m['fill'] > hi else 'too small'} ({m['fill']:.2f})")
    if m["top"] < QC["top"]:
        bad.append(f"no headroom ({m['top']:.3f})")
    return ", ".join(bad)


def render(character: int, skin: int, hair: int, force: bool = False) -> Path | None:
    name = f"avatar_c{character:02d}_skin{skin}_hair{hair:02d}"
    dest = ART / f"{name}.png"
    if dest.exists() and not force:
        print(f"  {name} exists, skipping")
        return dest
    _role, who, face = NEW_FACES[character]
    positive = POSITIVE.format(skin=SKIN[skin], who=who, face=face, hair=HAIR[hair])
    try:
        data = queue_and_wait(build_graph(positive, seed_for(character), name))
    except (RuntimeError, TimeoutError, urllib.error.URLError, OSError) as e:
        print(f"  {name} FAILED: {e}")            # one bad draw must not kill the batch
        return None
    dest.write_bytes(data)
    bad = qc_fail(measure(dest))
    print(f"  {name}" + (f"   FLAGGED: {bad}" if bad else ""))
    return dest


def sheet(cells: list[tuple[str, Path]], dest: Path, cols: int, cell: int = 190) -> Path:
    rows = (len(cells) + cols - 1) // cols
    bar = 20
    im = Image.new("RGB", (cols * cell, rows * (cell + bar)), (24, 28, 40))
    d = ImageDraw.Draw(im)
    for i, (label, path) in enumerate(cells):
        cx, cy = (i % cols) * cell, (i // cols) * (cell + bar)
        im.paste(Image.open(path).convert("RGB").resize((cell, cell), Image.LANCZOS), (cx, cy))
        d.text((cx + 4, cy + cell + 4), label, fill=(230, 218, 184))
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest)
    print(f"sheet: {dest}")
    return dest


def audit(dest: Path) -> Path:
    """One tile per existing character x skin tone. The evidence for the gap."""
    cells = []
    for c in range(1, 13):
        for s in SKINS:
            p = ART / f"avatar_c{c:02d}_skin{s}_hair02.png"
            if p.exists():
                cells.append((f"c{c:02d} skin{s}", p))
    return sheet(cells, dest, cols=4)


def pick_seed(character: int, candidates: tuple[int, ...]) -> None:
    """Try candidate seeds for one character and report which compositions pass.

    The seed has to be fixed per character — all 32 of its variants share it so
    the face stays recognisable — so choosing it is a one-off search, not
    something to re-roll per render. Whatever wins goes into COMPOSITION_SEED.
    """
    _role, who, face = NEW_FACES[character]
    positive = POSITIVE.format(skin=SKIN[1], who=who, face=face, hair=HAIR[2])
    cells = []
    for sd in candidates:
        out = OUT / f"_seed_c{character:02d}_{sd}.png"
        try:
            out.write_bytes(queue_and_wait(build_graph(positive, sd, f"seed_{sd}")))
        except (RuntimeError, TimeoutError, urllib.error.URLError, OSError) as e:
            print(f"  seed {sd} FAILED: {e}")
            continue
        m = measure(out)
        bad = qc_fail(m)
        print(f"  seed {sd}  fill {m['fill']:.2f} top {m['top']:.3f} bg {m['bg_var']:5.1f}  "
              + (f"FAIL: {bad}" if bad else "PASS"))
        cells.append((f"{sd} {'FAIL' if bad else 'PASS'}", out))
    if cells:
        sheet(cells, OUT / f"_seed_search_c{character:02d}.png", cols=len(cells))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", action="store_true", help="sheet the existing 12 faces, no rendering")
    ap.add_argument("--pick-seed", type=int, default=0, metavar="CHAR",
                    help="search composition seeds for one character")
    ap.add_argument("--probe", action="store_true",
                    help="render the candidate ethnicity phrasings side by side")
    ap.add_argument("--validate", action="store_true",
                    help="2 skins x 1 hair per new character — judge the faces before the full run")
    ap.add_argument("--all", action="store_true", help="every new character x skin x hair (128)")
    ap.add_argument("--chars", default="", help="comma-separated subset, e.g. 13,15")
    ap.add_argument("--skins", default="", help="comma-separated subset, e.g. 1,2")
    ap.add_argument("--hairs", default="", help="comma-separated subset, e.g. 2,7")
    ap.add_argument("--force", action="store_true", help="re-render over existing files")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.audit:
        audit(OUT / "_existing_faces.png")
        return
    if args.probe:
        probe(OUT / "_probe_phrasing.png")
        return
    if args.pick_seed:
        # every shipped character's seed — fresh seeds all failed QC, so the
        # search space is the compositions that are known to work.
        pick_seed(args.pick_seed, tuple(1000 + c * 10 for c in range(1, 13)))
        return

    chars = [int(c) for c in args.chars.split(",")] if args.chars else sorted(NEW_FACES)
    if args.validate:
        skins, hairs = (1, 3), (2,)
    else:
        skins = tuple(int(s) for s in args.skins.split(",")) if args.skins else SKINS
        hairs = tuple(int(h) for h in args.hairs.split(",")) if args.hairs else HAIRS
    if not (args.all or args.validate or args.chars or args.skins or args.hairs):
        raise SystemExit("Pick a scope: --validate, --all, or --chars/--skins/--hairs.")

    total = len(chars) * len(skins) * len(hairs)
    print(f"{total} portraits: chars {chars} x skins {list(skins)} x hairs {list(hairs)}\n")
    made: list[tuple[str, Path]] = []
    for c in chars:
        for s in skins:
            for hr in hairs:
                p = render(c, s, hr, args.force)
                if p:
                    made.append((f"c{c:02d} {NEW_FACES[c][0]} s{s} h{hr:02d}", p))

    if made:
        tag = "validate" if args.validate else "batch"
        sheet(made, OUT / f"_new_faces_{tag}.png", cols=min(len(hairs) * len(skins), 8))
    print(f"\n{len(made)}/{total} rendered into {ART}")
    print("Art lights up in the picker automatically once present "
          "(availableFaceTypes filters on artUrl), but FACE_TYPES and HAIR_LABELS "
          "in src/data/avatar-portraits.ts must list the new ids first.")


if __name__ == "__main__":
    main()
