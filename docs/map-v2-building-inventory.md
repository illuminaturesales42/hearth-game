# Map V2 — building art inventory

*Auto-generated. Which of the 15 map buildings use the new Full Building Final
art, and which are still legacy sprites awaiting a new set. Each cell shows the
times of day present (day = midday base).*

## ✅ NEW — sliced from `art-src/buildings/` (your Full Building Final push)

| Building | id | ruin | wip | L1 | L2 | L3 |
|---|---|---|---|---|---|---|
| Cottage | `town_cottage` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Bakery | `town_bakery` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Market | `town_market` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Garden | `town_garden` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Workshop | `town_workshop` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Farm | `town_farm` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| FisherHut | `town_fisherhut` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Sawmill | `town_sawmill` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Dock | `town_dock` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Library | `town_library` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |
| Well | `prop_well` | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night | day·dawn·dusk·night |

## ⚠️ LEGACY — old art, NOT in the push (need new Full Building Final sheets)

| Building | id | ruin | wip | L1 | L2 | L3 |
|---|---|---|---|---|---|---|
| TownHall | `town_townhall` | day | day | day | day | day |
| Forge | `town_blacksmith` | day | day | day | day | day |
| Lighthouse | `prop_lighthouse` | day | day | day | day | — |
| Sign | `prop_sign` | — | — | day | — | — |

### To replace the legacy 4

Drop these sheets into `art-src/buildings/` and push — the importer maps the names automatically:

- `Church.png` / `TownHall.png` → Town Hall
- `Blacksmith.png` / `Forge.png` → The Forge
- `LighthouseA.png` + `LighthouseB.png` → Lighthouse (A = dawn/midday, B = dusk/night)
- `Sign.png` / `NoticeBoard.png` → The Notice Board
