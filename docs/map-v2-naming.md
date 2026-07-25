# Map V2 — file naming + import guide

*The contract between the art pipeline and the game. Follow this and
`python tools/import_map_v2.py` wires everything in automatically.*

## The one command

```powershell
python tools/import_map_v2.py --dry-run   # see what it WOULD do (always run first)
python tools/import_map_v2.py             # import + regenerate the manifest
```

Sources it reads (edit the paths at the top of the script if these move):
- Plates: `Core/Map/Map times of dayFinal.png` (2×2 sheet: dawn|midday / dusk|night)
  — or, preferred, four label-free exports beside it: `map_dawn.png`, `map_midday.png`,
  `map_dusk.png`, `map_night.png`.
- Buildings: everything under `Core/Map/Full Building Final/` (subfolders fine —
  folder names count as part of the name, e.g. `Cottage/ruin.png`).

Afterwards: review the printed report, then commit `public/art/` + `src/art-manifest.ts`
and push. The game picks each piece up automatically — buildings can land a few at a
time ("start with what's available to test" works).

## Naming buildings

`<building> <state> [<time-of-day>]` in any order, any separators, any case:
`Cottage - Ruin.png`, `bakery_wip.png`, `Town Hall level2 night.png` all parse.

**Buildings** (aliases in parentheses are understood):
cottage (house/home) · bakery · market · garden (greenhouse) · townhall (church/chapel) ·
workshop (shop) · farm · fisherhut (hut/fisher) · sawmill (windmill/mill) ·
blacksmith (forge/smithy) · dock (pier/jetty/harbour) · library · well (wishing well) ·
sign (notice board) · lighthouse

**States** — every building should ship all five, in this story order:
1. `ruin` (rubble/damaged/destroyed) — storm-wrecked, how it first appears
2. `wip` (under construction/scaffold) — being rebuilt (the next one in line)
3. `l1` (level1/base/built) — restored
4. `l2` — upgraded
5. `l3` — beloved (fully upgraded)

**Times of day** (optional, per state): no suffix = day · `dawn` · `dusk` · `night`.
Night versions = lit windows; the engine crossfades them in over the real dusk.

**One sheet per building also works**: put the five states left→right in one PNG
(transparent gaps between them) and the importer cuts them in ladder order.

## Rules that keep the game working

- **Plates must be label-free and EMPTY of buildings** — the game composites the
  building sprites (ruins → construction → built) on top; baked-in buildings would
  clash with the restoration story. Same geography across all four times, sea stays
  blue (the engine's water mask reads blue-dominance).
- **Same silhouette + canvas framing across a building's states** — ruin/wip/l1/l2/l3
  of one building should sit on the same footprint so the swap never jumps.
- Transparent background, soft contact shadow only, no text/labels/watermarks,
  no gems (coins + ember-heart only).

## What the ids become in-game

`town_<name>[_ruin|_wip|_l2|_l3][_dawn|_dusk|_night]` (l1 = the bare id), e.g.
`Church - Ruins.png` → `town_townhall_ruin.png`. Well/sign/lighthouse use `prop_`.
Plates → `map_island_plate` (midday) + `_dawn`/`_dusk`/`_night` siblings.

## Manifest note

`import_map_v2.py` regenerates `src/art-manifest.ts` from the actual contents of
`public/art/` — so if you ever run the old `slice_assets.py` afterwards (it only
knows its own crops), just run `python tools/import_map_v2.py --manifest-only`
to resync.
