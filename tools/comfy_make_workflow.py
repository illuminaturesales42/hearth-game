"""
Build the Hearth building dial-in workflow as a LOADABLE ComfyUI UI graph and
install it on the running server.

Why generated rather than hand-written: node input/output slot order differs
between ComfyUI builds, and a workflow with mismatched slots loads with broken
links. This reads the live server's own /object_info, so the graph it emits
matches whatever build is actually listening.

  python tools/comfy_make_workflow.py

Then in ComfyUI: Workflow -> Browse (or the sidebar) -> "hearth_building_dialin".
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request

COMFY_URL = "http://127.0.0.1:8188"
WORKFLOW_NAME = "hearth_building_dialin.json"

# Connection types are link inputs; everything else is a widget.
PRIMITIVES = {"INT", "FLOAT", "STRING", "BOOLEAN"}

HOWTO = """HEARTH — BUILDING STYLE DIAL-IN (Canny-locked)

WHAT THIS IS
The structure spine that already worked (Canny ControlNet off the artist's own
reference cell) plus the new style layer: an IPAdapter pointed at a board of
real avatar portraits, so buildings inherit the catalogue's painterly look.

THE THREE DIALS (everything else stays put)
1  Checkpoint (node 1)      RealVisXL_V5.0 = what the 288 portraits used.
                            Juggernaut-XL_v9 = what the old buildings used.
2  Positive prompt (node 5) painterly dialect (loaded) vs the older ink-and-
                            pencil block. Only the style words differ.
3  IPAdapter (node 15)      weight 0.55 'style transfer' is the loaded default.
                            Try 0.85, or 'strong style transfer' at 0.70.
                            Bypass this node (Ctrl+B) for the no-adapter control.

LOCKED — do not touch while comparing styles
  ControlNet strength 0.95, start 0.0, END 0.72  <- load-bearing. 0.85 garbles
    fine detail; 0.60 collapses the style into 'photographed miniature'.
  Canny 100/200/1024 · seed 777777 · 40 steps · cfg 7.0 · dpmpp_2m/karras
  denoise 1.0 (txt2img — structure is Canny's job, never denoise's)
  Latent size MUST match the reference cell's aspect (l1 = 1024x848).

SWAPPING BUILDING / STATE
  node 2  reference cell   forge_ref_{ruin,wip,l1,l2,l3}.png
  node 8  latent WxH       ruin 1024x840 · wip 1024x832 · l1 1024x848
                           l2 1024x808 · l3 1024x792
  node 5  subject + state clause (docs/comfy-building-worksheet.md §4/§5)

ORDER MATTERS: generate L1 first as the identity anchor, approve it, then use
THAT image as an extra reference for the other four states.

The headless sweep of all 16 style combinations is tools/comfy_dialin.py.
"""

POSITIVE = (
    "cosy storybook building illustration, hand-painted digital illustration, "
    "warm painterly brushwork, visible brushstrokes, soft painted colour, gentle "
    "warm rim light from upper left, muted earthy old-seaside colour palette, "
    "driftwood brown cream sage muted teal rust, Emberhollow fishing village, "
    "children's book illustration style, 45-degree isometric view, a stone forge "
    "with a tall chimney, a glowing warm light from the furnace opening, an anvil "
    "and tools just outside the door -- newly rebuilt, clean plain honest "
    "stonework, simple sound roof, one window warmly lit, modest and bare but "
    "cared for, standing on its own small cobblestone plinth with a thin edge of "
    "moss and grass, (a plain uncluttered neutral grey backdrop, no ground plane "
    "beyond the plinth, no other buildings, no street, no sky, no scenery:1.3), "
    "(single subject, small and centred with an even ~10% empty margin on all "
    "four sides, not a close-up, not filling the frame, no part of the building "
    "touching the frame edge:1.35), (clearly defined wooden doors and windows "
    "with visible planks, iron hinges and simple frames, set squarely inside "
    "their stone openings:1.35), (structurally sound, every part properly joined "
    "and supported, signs and brackets firmly bolted, nothing floating or "
    "detached:1.3), (hand-drawn illustrated 2D game asset, flat isolated icon, "
    "NOT a photograph, NOT a physical object, NOT a miniature, NOT sitting on a "
    "real surface, no depth of field, no blur:1.4)"
)

NEGATIVE = (
    "flat vector, sterile, 3d render, cgi render, plastic, oversaturated, "
    "photograph, product photography, studio photography, diorama, physical model, "
    "miniature model, toy, real wood grain, real material, macro photography, "
    "unreal engine, octane render, modern architecture, photoreal, hyperrealistic, "
    "people, characters, extra structures, multiple buildings, village street, "
    "town square, cropped, low quality, sky, clouds, background scenery, landscape, "
    "checkerboard, gradient background, vignette, ground plane, grass field, "
    "meadow, terrain, drop shadow, close-up, zoomed in, cut off, touching edge of "
    "frame, filling the frame, off-centre, text, watermark, signature, flat "
    "cel-shaded anime, manga, floating objects, levitating, detached, disconnected, "
    "unsupported, hovering sign, broken geometry, warped, melted, impossible "
    "construction, misaligned door, duplicated door, malformed opening, smeared "
    "detail, mushy shapes, indistinct doorway, photo, wooden shelf, mantel, table "
    "surface, indoor scene, blurry background, depth of field, bokeh, miniature, "
    "diorama, model, figurine, ornament, tilt-shift"
)

# id -> (class_type, pos, widget overrides, title)
NODES = [
    (1, "CheckpointLoaderSimple", (40, 480), {"ckpt_name": "RealVisXL_V5.0.safetensors"}, "1 · Checkpoint (DIAL)"),
    (2, "LoadImage", (40, 640), {"image": "forge_ref_l1.png"}, "2 · Reference cell (swap per state)"),
    (3, "CannyEdgePreprocessor", (400, 640), {"low_threshold": 100, "high_threshold": 200, "resolution": 1024}, "3 · Canny — LOCKED"),
    (4, "ControlNetLoader", (400, 800), {"control_net_name": "controlnet-canny-sdxl.safetensors"}, "4 · ControlNet model"),
    (5, "CLIPTextEncode", (400, 40), {"text": POSITIVE}, "5 · POSITIVE (DIAL: style dialect)"),
    (6, "CLIPTextEncode", (400, 340), {"text": NEGATIVE}, "6 · Negative — locked"),
    (7, "ControlNetApplyAdvanced", (760, 340), {"strength": 0.95, "start_percent": 0.0, "end_percent": 0.72}, "7 · Apply ControlNet — end 0.72 LOCKED"),
    (8, "EmptyLatentImage", (760, 560), {"width": 1024, "height": 848, "batch_size": 1}, "8 · Latent — match cell aspect"),
    (9, "KSampler", (1080, 340), {"seed": 777777, "steps": 40, "cfg": 7.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}, "9 · Sampler — locked"),
    (10, "VAEDecode", (1420, 340), {}, "10 · Decode"),
    (20, "SaveImage", (1420, 460), {"filename_prefix": "dialin_forge_l1"}, "20 · Save"),
    (12, "IPAdapterModelLoader", (40, 40), {"ipadapter_file": "ip-adapter-plus_sdxl_vit-h.safetensors"}, "12 · IPAdapter model"),
    (13, "CLIPVisionLoader", (40, 160), {"clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"}, "13 · CLIP Vision"),
    (14, "LoadImage", (40, 280), {"image": "_dialin_style_board.png"}, "14 · STYLE BOARD (avatar portraits)"),
    (15, "IPAdapterAdvanced", (760, 40), {"weight": 0.55, "weight_type": "style transfer", "combine_embeds": "concat", "start_at": 0.0, "end_at": 1.0, "embeds_scaling": "V only"}, "15 · IPAdapter (DIAL: weight/type)"),
]

# (from_node, from_slot_name, to_node, to_slot_name)
LINKS = [
    (1, "MODEL", 15, "model"),
    (12, "IPADAPTER", 15, "ipadapter"),
    (14, "IMAGE", 15, "image"),
    (13, "CLIP_VISION", 15, "clip_vision"),
    (1, "CLIP", 5, "clip"),
    (1, "CLIP", 6, "clip"),
    (2, "IMAGE", 3, "image"),
    (5, "CONDITIONING", 7, "positive"),
    (6, "CONDITIONING", 7, "negative"),
    (4, "CONTROL_NET", 7, "control_net"),
    (3, "IMAGE", 7, "image"),
    (15, "MODEL", 9, "model"),
    (7, "positive", 9, "positive"),
    (7, "negative", 9, "negative"),
    (8, "LATENT", 9, "latent_image"),
    (9, "LATENT", 10, "samples"),
    (1, "VAE", 10, "vae"),
    (10, "IMAGE", 20, "images"),
]


def object_info() -> dict:
    with urllib.request.urlopen(f"{COMFY_URL}/object_info", timeout=60) as r:
        return json.loads(r.read().decode())


def split_inputs(spec: dict) -> tuple[list[tuple[str, str]], list[tuple[str, object]]]:
    """Return (link_inputs, widget_inputs) in the server's declared order."""
    links: list[tuple[str, str]] = []
    widgets: list[tuple[str, object]] = []
    req = spec.get("input", {}).get("required", {})
    opt = spec.get("input", {}).get("optional", {})
    for name, cfg in list(req.items()) + list(opt.items()):
        t = cfg[0]
        if isinstance(t, list):  # combo -> widget
            widgets.append((name, cfg))
        elif t in PRIMITIVES:
            widgets.append((name, cfg))
        else:
            links.append((name, t))
    return links, widgets


def widget_default(name: str, cfg, override: dict):
    if name in override:
        return override[name]
    t = cfg[0]
    meta = cfg[1] if len(cfg) > 1 and isinstance(cfg[1], dict) else {}
    if isinstance(t, list):
        return t[0] if t else ""
    if "default" in meta:
        return meta["default"]
    return {"INT": 0, "FLOAT": 0.0, "STRING": "", "BOOLEAN": False}.get(t, "")


def main() -> None:
    info = object_info()
    missing = [c for _, c, _, _, _ in NODES if c not in info]
    if missing:
        raise SystemExit(f"Server does not have these node classes: {missing}")

    nodes = []
    slots: dict[int, dict] = {}
    for order, (nid, cls, pos, override, title) in enumerate(NODES):
        spec = info[cls]
        link_inputs, widget_inputs = split_inputs(spec)
        out_types = spec.get("output", [])
        out_names = spec.get("output_name") or out_types
        widgets_values = []
        for name, cfg in widget_inputs:
            widgets_values.append(widget_default(name, cfg, override))
            # the frontend inserts a control widget straight after a seed
            if name in ("seed", "noise_seed"):
                widgets_values.append("fixed")
            # ...and LoadImage carries an upload button widget after `image`
            if cls == "LoadImage" and name == "image":
                widgets_values.append("image")
        nodes.append(
            {
                "id": nid,
                "type": cls,
                "pos": list(pos),
                "size": [340, 120 + 26 * max(len(widgets_values), 1)],
                "flags": {},
                "order": order,
                "mode": 0,
                "inputs": [{"name": n, "type": t, "link": None} for n, t in link_inputs],
                "outputs": [
                    {"name": str(on), "type": str(ot), "links": [], "slot_index": i}
                    for i, (on, ot) in enumerate(zip(out_names, out_types))
                ],
                "properties": {"Node name for S&R": cls},
                "title": title,
                "widgets_values": widgets_values,
            }
        )
        slots[nid] = {
            "in": [n for n, _ in link_inputs],
            "out": [str(o) for o in out_names],
            "node": nodes[-1],
        }

    links = []
    for lid, (src, src_out, dst, dst_in) in enumerate(LINKS, start=1):
        s, d = slots[src], slots[dst]
        if src_out not in s["out"]:
            raise SystemExit(f"node {src} has no output '{src_out}' (has {s['out']})")
        if dst_in not in d["in"]:
            raise SystemExit(f"node {dst} has no input '{dst_in}' (has {d['in']})")
        si = s["out"].index(src_out)
        di = d["in"].index(dst_in)
        ltype = s["node"]["outputs"][si]["type"]
        links.append([lid, src, si, dst, di, ltype])
        s["node"]["outputs"][si]["links"].append(lid)
        d["node"]["inputs"][di]["link"] = lid

    note = {
        "id": 99,
        "type": "Note",
        "pos": [1420, 620],
        "size": [520, 620],
        "flags": {},
        "order": len(NODES),
        "mode": 0,
        "inputs": [],
        "outputs": [],
        "properties": {},
        "title": "READ ME — how to dial the style",
        "widgets_values": [HOWTO],
        "color": "#432",
        "bgcolor": "#653",
    }

    wf = {
        "last_node_id": 99,
        "last_link_id": len(links),
        "nodes": nodes + [note],
        "links": links,
        "groups": [
            {"title": "STYLE (the dials)", "bounding": [20, -20, 1060, 380], "color": "#3f789e", "font_size": 24, "flags": {}},
            {"title": "STRUCTURE (locked)", "bounding": [20, 600, 1060, 380], "color": "#8A8", "font_size": 24, "flags": {}},
        ],
        "config": {},
        "extra": {},
        "version": 0.4,
    }

    body = json.dumps(wf).encode()
    path = urllib.parse.quote(f"workflows/{WORKFLOW_NAME}", safe="")
    req = urllib.request.Request(
        f"{COMFY_URL}/userdata/{path}?overwrite=true",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()
    print(f"installed: {WORKFLOW_NAME}  ({len(nodes) + 1} nodes, {len(links)} links)")
    print("In ComfyUI: Workflow -> Browse -> hearth_building_dialin")


if __name__ == "__main__":
    main()
