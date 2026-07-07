# MVP Upgrade Plan — UI · Map · Gameplay
*2026-07-07 · Source of truth for ALL visuals: `C:\Users\illum\OneDrive\Desktop\Hearth` (sheets + design docs). Nothing gets invented that the folder doesn't support.*

## Reference inventory still unmined (by sheet)
| Sheet | Unused assets we'll draw from |
|---|---|
| Batch 2 (`01be…`) | Fishing boats & harbour props, NPC **map-scale sprites**, animals (gull/cat/dog), location banners & markers, 6 location vignettes |
| Batch 5–7 (`7f86…`) | NPC expression portraits (7 per character), walking sprites, **building upgrade sets (L1→L3 + construction)**, interiors, FX stills (weather, particles, confetti) |
| Batch 8–9 (`fc42…`) | **Achievement badge art**, loading illustrations, seasonal/festival decor, event icons, quest UI reference |
| Corepack 1 (`…42_47`) | Terrain tiles, extra decorations/props, banners, icon set |
| Corepack 2 (`…42_55`) | **Chest open/closed (large)**, dialogue window pattern, energy-bar states, collection book, mini-map reference |
| Corepack 3 (`…43_01`) | Fences & walls, stone-path tiles (buildings/props already mined) |
| Corepack 4–5 | **Player avatar**, big L1 buildings, resource icons |

## Sprint 1 — Feel & polish (UI)
1. **Parchment framing everywhere**: apply the sliced `panel_parchment` / `popup_window` as 9-slice `border-image` on sheets, modals, and cards — the last flat-CSS surfaces become crafted panels.
2. **Reward moments**: real chest art on chest opens; a proper reward modal (chest → coin burst FX still → count-up) instead of a toast.
3. **Dialogue windows**: story beats presented as corepack2-style dialogue — bust + name plate + parchment bubble (all portraits already sliced).
4. **Achievement badge art** (batch89) replaces emoji medallions on Collect.
5. **Energy pill states**: full/medium/low/empty visual states (corepack2 pattern).
6. **Board QoL**: long-press item info card (name, chain, what it merges into), trash-with-confirm, single-step undo.
7. **Duel discoverability**: entry card on Create.

## Sprint 2 — The living map
1. **Villagers walk the town**: map-scale sprites (batch567 5.2, keyed) appear as their story orders complete; simple waypoint ambling between their buildings. Cat on the bench at stage 3+, gulls over the dock (batch2 animals).
2. **Boats return**: fishing boats moored at stage 3+, gentle bob; dock traffic grows with progress (docs' town-growth table: "fishing fleet returns at 50%").
3. **Tappable buildings**: tap any returned building → parchment card with its name, the story beat that restored it, and (Sprint 3) its upgrade level.
4. **Real paths & fences**: stone-path tiles + fence sprites (corepack3) replace painted strokes; fences frame the farm and garden.
5. **Location banners** (batch2 map UI) label key buildings at higher stages.
6. **Cozy weather moments**: occasional soft rain/fog overlays from batch567 7.4 stills (post-MVP if time is tight).

## Sprint 3 — Gameplay loops
1. **Decor placement — the missing coin sink**: spend coins to place benches, lamps, flower beds, fences onto the town (props already sliced); player decor persists in the save (docs: "player-placed decor persists year-round"). Coins finally buy town beauty — never power.
2. **Building upgrades L2/L3** (batch567 6.1 sets): once the story returns a building, coins can upgrade it — visible on the map, second long-term sink.
3. **Order queue**: show the next order alongside the current one so players can plan chains (top-merge-game pattern).
4. **Duel "Friend" AI**: a simple greedy opponent so solo players can play Bonfire Duel without a second human.
5. **Economy simulation test**: a vitest that "plays" both chapters and asserts days-to-complete stays within the pacing band; tune `HEALTH_RULES`/rewards from it.
6. **Playwright smoke in CI**: launch → merge → deliver → reload persists.
7. **Loading illustration** (batch89) behind first-load precache.

## Rules of engagement
- Every visual sliced from the folder sheets via `tools/slice_assets.py` (probe → slice → contact verify); ComfyUI regeneration only for assets the sheets lack.
- Hearth Test gate on every feature (no pressure, no FOMO, energy never sold).
- Each sprint lands green (tests + build), committed, pushed.

## Remote testing
- Quick tunnel (session-bound): serve `dist` via `npx http-server dist -p 4173` + `npx cloudflared tunnel --url http://localhost:4173`.
- Permanent URL: `wrangler login` once, then `npx wrangler pages deploy dist --project-name hearth` (or connect the GitHub repo to Cloudflare Pages for auto-deploys).
