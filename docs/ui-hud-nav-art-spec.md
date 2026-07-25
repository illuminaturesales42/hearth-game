# UI Art Spec — Nav Medallions & the Under-Map HUD

Assets for the bottom navigation and the new under-map HUD strip.
Reference sheet: **`Graphics and UI/Core/Final Assets/Batch 13 – UI panels and information.png`**
(panel 1 "Main HUD Bar" and panel 2 "Top Resource Strip" are the target idiom).

All of these are **drop-in**: the code already looks each id up via `artUrl()` and
falls back gracefully, so nothing breaks before they land and nothing needs
re-wiring after.

---

## P1 — `nav_create` (fixes a visibly broken button)

**The bug it fixes:** the Create tab looks like an empty slot. Four of the five
nav buttons use purpose-made 64px medallions (`nav_shop`, `nav_home`,
`nav_villagers`, `nav_journal`). Create has **no medallion at all** — it borrows
`item_wood_3`, a detailed 220px *merge-board sprite* of a hammer. Scaled into a
26px slot at 0.72 opacity, dark wood on a dark bar, it reads as nothing. A
contrast lift is applied as a stopgap; this asset is the real fix.

| Field | Value |
|---|---|
| File | `nav_create.png` |
| Canvas | **64 × 64**, PNG RGBA, transparent |
| Style | Match `nav_shop.png` / `nav_home.png` / `nav_villagers.png` / `nav_journal.png` **exactly** — same circular medallion treatment, stroke weight, palette and internal padding (they are ~8 KB each; open one alongside) |
| Subject | The workshop/creation verb — a hammer, or hammer-and-anvil. Must read as a **silhouette at 26px** |
| Contrast | Critical: it sits on a dark navy bar at 72% opacity when inactive. Keep the subject **light/warm against transparency** — a dark object disappears |
| Slots into | `src/ui/app-shell.ts` nav loop — picked up automatically, and the stopgap contrast class stops applying |

**Also available but unused:** `nav_map.png` already exists and is orphaned
(there is no "map" screen). If you'd rather re-cut it than draw new, it's there.

---

## P2 — HUD strip panel art (optional polish)

The strip is currently drawn in CSS (rounded dark-wood gradient, gold hairline,
inner highlight). It looks correct, but painted panel art would match Batch 13
exactly.

| File | Canvas | Notes |
|---|---|---|
| `ui_hud_bar.png` | **1024 × 128**, transparent, 9-slice friendly | The bar itself, per Batch 13 panel 1: dark wood, brass corner accents, soft inner highlight. Keep the **left 120px clear** for the portrait ring, and the middle flat so text sits on it |
| `ui_hud_portrait_ring.png` | 128 × 128, transparent centre | The gold ring that frames the portrait. Currently a CSS `inset` ring |
| `ui_hud_divider.png` | 8 × 64, transparent | The vertical separator between blocks (currently a 1px gold line) |

If these ship, the CSS gradient becomes a fallback — the same art-gated pattern.

---

## P3 — Weather glyphs (optional)

The HUD reuses the existing painted `time_badge_*` set (`midday`, `night`,
`sunrise`, `sunset`) for its icon, which works well. A dedicated weather set
would let the icon show the **sky** rather than the time of day.

| Files | Canvas | Subjects |
|---|---|---|
| `wx_clear`, `wx_clouds`, `wx_overcast`, `wx_fog`, `wx_rain`, `wx_storm`, `wx_snow` | 64 × 64, transparent | One per `WeatherKind` in `src/core/world-mood.ts` |
| | | Match the `time_badge_*` treatment; must read at 30px |

Wiring note for later: prefer `wx_<kind>` and fall back to `time_badge_*`.

---

## Style rules (all of the above)

- Painterly storybook, warm old-seaside palette — match `nav_*`, `time_badge_*`, `icon_*`.
- **Readability at final size beats detail.** These render at 26–30px; a 220px
  illustration squeezed down is exactly the bug being fixed here.
- Light/warm subjects on transparency — everything sits on dark chrome.
- PNG RGBA, transparent, no baked background or frame unless stated.

---

## P4 — `wordmark_hearth` high-res re-export (splash/header text)

**The bug it fixes:** the splash-screen wordmark reads soft/blurry. The source file is only **304×94px**, but the splash CSS displayed it up to 380px wide — a ~1.25x upscale of a small raster, which softens the thin lettering. (A stray 1–2px vertical line baked into the old file's right edge has already been cleaned directly in `public/art/wordmark_hearth.png` — not an asset request, just noted for history.) As an interim fix, the splash CSS cap was reduced to the source's native 300px so nothing is currently upscaled — this re-export is what lets that cap go back up.

| Field | Value |
|---|---|
| File | `wordmark_hearth.png` (replaces the existing file — same id, same aspect ratio ~3.23:1) |
| Canvas | **at least 608 × 188** (2x the current native size — 3x/912×282 preferred for retina headroom), transparent, RGBA |
| Content | Exactly the current lockup — "HEARTH" lettering, ember flame mark above the A, "MERGE · CARE · RESTORE" subline, leaf sprigs both sides — just re-exported sharp at higher resolution. No redesign needed |
| Symmetry | Keep the leaf flourish genuinely mirrored left/right — the current file reads slightly asymmetric even after cleanup |
| Used at | Splash screen (`.splash-wordmark`, up to 300px today, could return to ~380px+ once re-exported) and the in-app header (`.brand-wordmark`, 32px tall — already comfortably sharp, unaffected either way) |

**Pipeline:** drop the replacement PNG at `public/art/wordmark_hearth.png` (same filename — no manifest change needed, it's referenced directly in `index.html`, not via `artUrl`). Once it lands, raise `.splash-wordmark`'s `width: min(76vw, 300px)` back up in `src/styles.css`.

## Pipeline
Drop the PNG in `public/art/` → regenerate the manifest (`python tools/import_map_v2.py --manifest-only`, or the relevant slicer) → reload. No code changes.

## Acceptance
- [ ] `nav_create` reads clearly at 26px on the dark bar, active and inactive
- [ ] It sits consistently beside the other four medallions
- [ ] Delete-art test: removing it falls back to the lifted hammer, no errors
- [ ] `wordmark_hearth` reads crisp on the splash screen at its full display size
