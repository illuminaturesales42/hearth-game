# HEARTH — Map V2 handover (for a local Claude with filesystem access)

**You are picking up from a Claude Code *web* session that cannot read the
user's Windows drive.** All the game code + tooling is done and on the branch;
the only thing blocking completion is getting the final map art out of the
user's OneDrive and into the repo. You (running locally) can reach those files.
Do the file sync + push, then either hand back to the web session or finish the
placement yourself (the pipeline is fully built — instructions below).

---

## 0. Ground rules

- **Repo:** `F:\Mastermind launch\hearth`  (`github.com/illuminaturesales42/hearth-game`)
- **Work only on branch:** `claude/hearth-game-git-sync-u4mtsb`
- **Push:** `git push -u origin claude/hearth-game-git-sync-u4mtsb` (retry on network error).
- **Do NOT open a GitHub PR** unless the user asks.
- Commit message trailer to use:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012FwgwgaKPTNAqU95ueK5yk
  ```
- Never put a model identifier in commits/PRs/code.
- PowerShell has no `&&` — one command per line. Spaces in the OneDrive path
  break multi-line pastes; run each line separately.

---

## 1. The one job that's blocked (do this first)

The user's final art lives at:
`C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Map`

The repo already has an older subset under `art-src/Map/`. **Missing on the
remote:** the `Maps\` folder (the FINAL empty terrains) and
`Full Building Final\Town hall.png`.

Sync the whole folder in and push:

```powershell
cd "F:\Mastermind launch\hearth"
git pull origin claude/hearth-game-git-sync-u4mtsb
robocopy "C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Map" "art-src\Map" /E
git add -A
git commit -m "art: sync Core/Map (Maps terrains + Town hall)"
git push -u origin claude/hearth-game-git-sync-u4mtsb
```

- `robocopy … /E` copies the whole tree incl. subfolders. **Exit code 1 = success**
  (files copied); anything ≥ 8 is a real error.
- If files are OneDrive **cloud-only** (copy fails / 0 bytes): in Explorer,
  right-click the `Map` folder → **"Always keep on this device"**, wait for the
  green check, re-run the robocopy line.
- **Verify before pushing:** `Get-ChildItem "art-src\Map\Maps" -Name` should list
  `Midday.png`, `Dawn.png`, `Dusk.png`, `Evening.png`, `Night.png`,
  `layoutTESTONLY.jpg`. And `Test-Path "art-src\Map\Full Building Final\Town hall.png"`
  should return `True`.
- GitHub rejects any single file > 100 MB. If a push bounces, the offending file
  is too big — tell the user; use Git LFS or a downscaled export.

**Once this is pushed, the web session can finish everything.** If you'd rather
finish locally, continue below.

---

## 2. What already exists (don't redo)

- **All game code + engine seams** for the living time-of-day world (5-phase-ready
  plate crossfade, per-building `_dawn/_dusk/_night` overlays, environment
  controller, UI theming). Done, green, shipped on the branch.
- **The importer:** `tools/import_map_v2.py` — turns the source art into game assets.
- **The preview rig:** `tools/compose_map_mock.py` — composites sprites on the plate
  to judge placement offline (no game run needed).
- **Layout data:** `src/data/town-layout.ts` → `TOWN_BUILDINGS_V2` (14 buildings) +
  `LIGHTHOUSE_ANCHOR`, `PLAZA`. Gated by `MAP_V2` (true when the imported plates
  exist). Tests in `tests/town-layout.test.ts`.
- **Building art is already sliced** for all 14 (incl. new Forge + Lighthouse).
  Only **Town Hall** still uses an old sprite — it needs `Town hall.png` (see §1).

---

## 3. The source art, explained

Under `art-src/Map/` after the sync:

| Path | What it is |
|------|-----------|
| `Maps/Midday.png` (+ Dawn/Dusk/Evening/Night) | **THE plates to use** — empty island, big water buffer, one per time of day |
| `Maps/layoutTESTONLY.jpg` | **THE layout to copy** — the island with all 14 buildings placed. `Midday.png` is this minus the buildings (same framing) |
| `Full Building Final/*.png` | Per-building **matrix sheets**: 5 columns (Ruin, Under-Construction, L1, L2, L3) × 4 rows (Dawn, Midday, Dusk, Night). Library + Lighthouse each ship as two half-sheets `…A`=dawn/midday, `…B`=dusk/night |
| `refrence buildings.png` | Named catalog of all 14 buildings (see §5) |
| `Tests/…`, `Map times of dayFinal.png` | earlier/alt versions — ignore for final |

Naming contract the importer understands: `docs/map-v2-naming.md`.

---

## 4. Run the pipeline (locally, after the sync)

From the repo root, with Python + Pillow + numpy + scipy, and pnpm installed:

```powershell
# 1. slice plates + building sheets into public/art + regenerate the manifest
python tools/import_map_v2.py --dry-run     # sanity report first
python tools/import_map_v2.py               # do it

# 2. the importer prefers art-src/Map/Maps/Midday.png as the base plate
#    (it also splits the 2x2 sheets if the singles are absent)

# 3. gate — all three must stay green
npx tsc --noEmit
npx vitest run
pnpm build
```

The importer:
- slices each building matrix into `town_<name>[_ruin|_wip|_l2|_l3][_dawn|_dusk|_night]`
  (L1 midday = the bare id), border-flood keying the white background,
- keeps every phase variant of a state on a shared canvas so the engine's
  crossfade stays pixel-registered,
- regenerates `src/art-manifest.ts` from `public/art/` (ground truth on disk).

> **Plate note:** it currently prefers `art-src/Map/Maps/Midday.png` for the
> *midday* plate but still splits the 2×2 sheet for dawn/dusk/night. If the
> `Maps/` folder has individual Dawn/Dusk/Evening/Night exports, wire those in
> (edit `import_plates()` / `PLATE_ID` in `tools/import_map_v2.py`). The engine
> blends 4 phases today (dawn/midday/dusk/night); "Evening" is a 5th terrain the
> user may want as its own beat — confirm with them before adding a phase.

---

## 5. The placement task — "copy layoutTESTONLY exactly"

The 14 buildings (from `refrence buildings.png`) and their game ids:

| # | Name | id | notes |
|---|------|----|----|
| 1 | The Old Cottage | `town_cottage` | |
| 2 | Bran's Bakery | `town_bakery` | above the well |
| 3 | Market Square | `town_market` | red-white striped awning |
| 4 | The Garden | `town_garden` | glass greenhouse dome |
| 5 | The Town Hall | `town_townhall` | grand clock-tower; needs `Town hall.png` |
| 6 | The Workshop | `town_workshop` | |
| 7 | Meadow Farm | `town_farm` | barn + silo + cows |
| 8 | Joss's Hut | `town_fisherhut` | stilts, **on water** (east shore) |
| 9 | The Sawmill | `town_sawmill` | open timber barn |
| 10 | The Forge | `town_blacksmith` | glowing forge |
| 11 | North Docks | `town_dock` | pier + boat, **on water** (SE) |
| 12 | The Library | `town_library` | 2-storey, bottom-left |
| 13 | The Lighthouse | `prop_lighthouse` | alone on the NE islet (`LIGHTHOUSE_ANCHOR`) |
| 14 | The Village Well | `prop_well` | centre |

**Anchor convention (critical):** the engine draws each sprite with
`drawImage(img, x*W - w/2, y*H - h)`. So **`(x, y)` is the sprite's
bottom-centre — its ground-contact point**, NOT its centre. When reading a
position off `layoutTESTONLY`, take the point where the building's base meets the
plot (bottom of the footprint), as a fraction of the full image. Getting this
wrong makes buildings float above their plots (the mistake the web session hit).

**Method to copy it exactly:**
1. Set `map_island_plate*` from `Maps/*` (via the importer).
2. For each building, read its ground-contact `(x, y)` and footprint width `w`
   (fraction of image width) off `layoutTESTONLY.jpg`.
3. Put those into `TOWN_BUILDINGS_V2` in `src/data/town-layout.ts` (keep the
   existing `art`, `unlockAt`, `smoke`, `ruinVariant`, `water` fields — only the
   `x/y/w` change). Set `water: true` for Joss's Hut + Dock; update
   `LIGHTHOUSE_ANCHOR` for the islet.
4. Preview until it matches: `python tools/compose_map_mock.py out.png --layout v2 --phase midday --orders 72`
   then open `out.png` and compare to `layoutTESTONLY`. Iterate the numbers.
5. Keep `tests/town-layout.test.ts` green (bounds/collision/water-region checks —
   the water region for the east/SE shore is already encoded).

---

## 6. Verify + hand back

- Green gate: `npx tsc --noEmit` && `npx vitest run` && `pnpm build`.
- Offline sheet for the user:
  `python tools/compose_map_mock.py --sheet docs/map_v2_showcase.png` (4 phases × 3
  restoration stages).
- Commit `public/art/`, `src/art-manifest.ts`, `src/data/town-layout.ts`,
  `art-src/Map/**`, and push.
- Deploy (Cloudflare Pages project `hearth-5q8`, production branch = this branch):
  `pnpm run deploy` → live at `https://hearth-5q8-a45.pages.dev/?tester`
  (the PWA service worker caches hard — reopen twice, or unregister it, to see a
  new build). `hearthSky('night'|'day'|'dawn'|'sunset')` in the console forces a
  time of day for inspection.

That's everything. The single unblock is §1; the rest is already built.
