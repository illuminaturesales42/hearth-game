# Track B — Photo & Share Upgrade

**Goal:** turn the existing share card from a plain composite into a keepsake worth posting — with the player's own face on it — and stop discarding the real camera shot.

**Why now:** this is the game's organic-growth hook (`src/ui/growth.ts:5` calls it "the 10-second-clip hook"), it is *already real* (not a stub), and it builds directly on the finished avatar system.

---

## What exists today (verified)

**`shareTown()` — `src/ui/growth.ts:98`** — genuinely works:
- Grabs `#map-canvas`, composes a **1080×860** PNG: night-navy background (`#0f1626`), the town drawn at `pad=40`, a thin gold stroke rect, `HEARTH` in Georgia serif, a live **sky stamp** (`skyStamp()` — real weather + light + moon), and a "% restored" caption.
- Hands it to the OS via `navigator.share({files})`, with a download fallback + toast.

**`src/ui/photo-action.ts`** — a genuine camera feature (getUserMedia viewfinder, sun-gated sunrise/sunset windows via `src/core/sun`, honour-system fallback). **The captured image is never used** — it earns energy and is discarded.

**Gaps:** no avatar on the card, one hardcoded style, no seasonal variation, and the camera keepsake is thrown away.

---

## New assets

### B1 — Card frames (primary)
| Field | Value |
|---|---|
| Files | `share_frame_default.png` + optional `share_frame_spring/summer/autumn/winter.png` |
| Canvas | **1080 × 860**, PNG RGBA, **transparent centre** — decorative border only |
| Style | Painted frame in Hearth's palette: driftwood, rope, brass corners; seasonal variants add blossom / shells / leaves / frost to the same base geometry |
| Rule | The safe inner area must stay clear: the town image occupies `x 40–1040, y 150–(150+mapH)`. Keep decoration to the outer ~40–60px band and the corners |
| Fallback | Absent → current thin gold stroke rect (unchanged behaviour) |

### B2 — Card backdrops (optional)
| Field | Value |
|---|---|
| Files | `share_backdrop_default.png`, optionally seasonal |
| Canvas | 1080 × 860, opaque |
| Style | Warm painted parchment / soft coastal wash to replace the flat `#0f1626` navy |
| Fallback | Absent → current navy fill |

### B3 — Stamps / motifs (optional)
| Field | Value |
|---|---|
| Files | `share_stamp_<season>.png`, `share_stamp_<festival>.png` |
| Canvas | ~200 × 200, transparent |
| Style | Small painted corner motif (a wax seal, a sprig, a lantern) — reads at thumbnail size |
| Use | Bottom-right corner; ties into Track C festivals |

### B4 — Photo keepsake frames (for the camera path)
| Field | Value |
|---|---|
| Files | `photo_frame_default.png` (+ optional variants) |
| Canvas | Square **1080 × 1080**, transparent centre |
| Style | Painted photo-corner / taped-print look, as if pasted into a journal |

**Avatar art is reused** — no new portrait assets; `portraitArt(id)` from `src/data/avatar-portraits.ts` returns the URL.

---

## Code sketch

### 1. Avatar on the share card
```ts
// inside shareTown(), after the town is drawn
const me = this.game.avatar;                       // normalised, always valid
const url = portraitArt(me.portrait);
if (url) {
  const img = await loadImage(url);                // small helper; skip on failure
  // circular clip, bottom-left, ~140px, matching the villager-bust treatment
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); ctx.restore();
}
if (me.name) ctx.fillText(me.name, …);             // beside the portrait
```
Everything is optional/art-gated: no portrait art → the card composes exactly as it does today.

### 2. Frame & backdrop overlay
```ts
const season = currentSeason();                    // from src/ui/weather.ts
const frame = artUrl(`share_frame_${season}`) ?? artUrl('share_frame_default');
// backdrop drawn FIRST (before the town), frame drawn LAST (over everything)
```

### 3. Surface the camera keepsake
In `photo-action.ts`, keep the captured frame in memory (never uploaded, never persisted unless the player acts) and offer a single **"Keep this one"** action that composes it into a `photo_frame_*` card and passes it to the same share/download path. Reuse `shareTown()`'s blob→`navigator.share` tail by extracting it into a small `shareCanvas(canvas, filename, text)` helper.

**Privacy rule to honour:** the photo stays on the device. The existing feature is explicit that the image never leaves; sharing must be an explicit, per-shot player action.

---

## Design notes
- **Keep the sky stamp.** `skyStamp()` (real weather/light/moon) is the card's most distinctive idea — the town in the picture literally shows the player's live sky. Don't bury it.
- **Everything degrades.** Each new asset is independently optional; the card must always compose.
- **Static compose** — no animation, so reduced-motion is not a factor.
- **Watermark/brand:** the card already says `HEARTH`. Keep it on every variant so shares are recognisable.

---

## Acceptance checklist
- [ ] Share card shows the player's portrait + name when an avatar exists
- [ ] `share_frame_*` overlays when present; seasonal variant chosen from real season
- [ ] Backdrop/stamp optional paths work
- [ ] Camera shot can become a framed keepsake; image never leaves device without an explicit share
- [ ] **Delete-art test:** with no new PNGs the card is byte-comparable to today's output
- [ ] `npx tsc --noEmit`, `npx vitest run`, eslint clean; manual share test in `pnpm dev` (and on a real phone for `navigator.share`)
