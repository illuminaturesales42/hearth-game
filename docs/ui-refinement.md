# Hearth — UI Refinement (style-guide alignment)

Tracks how the live UI maps to the Hearth style guide (the HEARTH · Merge & Mystery sheet), what's been applied, and what's recommended next. No styles outside the guide; functionality preserved.

## Design tokens (guide → CSS)
Applied in `src/styles.css :root`.

| Guide swatch | Token | Use |
|---|---|---|
| Deep navy | `--navy-0/1/2` | app ground, chrome |
| Warm night | `--panel/-2` | dark cards, sheets |
| Parchment / tan | `--parch/-2`, `--wood` | order card, popups, paper |
| Amber gold (accent) | `--ember`, `--ember-hi`, `--ember-deep`, `--gold-edge` | primary buttons, energy, highlights |
| Teal (secondary) | `--teal`, `--teal-hi`, `--teal-deep` | secondary buttons, cool accents |
| Olive / terracotta | `--olive`, `--terracotta` | supporting accents (map, badges) |
| Cream / ink | `--cream`, `--cream-dim`, `--ink` | text on dark / on parchment |

Amber stays the single primary accent; **teal is the defined secondary** (matches the guide's secondary button + energy bar). Radius scale locked: panels 18 / cards 14 / cells 12 / **buttons 12** (`--r-btn`, chunky game buttons, no longer pills).

## Components (applied)

- **Primary button** → gold vertical gradient (`#ffd884 → ember → ember-deep`), 1.5px `--gold-edge` border, inset top-highlight + bottom-shade, dark ink text, warm text-shadow. Radius 12. Maps to guide "PRIMARY BUTTON".
- **Secondary button** (`.btn-secondary`) → teal gradient, teal-deep border, cream text. Maps to "SECONDARY BUTTON". Available for popup Cancel / tertiary actions.
- **Disabled button** → flat slate gradient, muted text, no glow. Maps to "DISABLED BUTTON" (was low-opacity; now a proper disabled state).
- **Small action buttons** (`.earn-btn`: Go/Do/Begin/Place/Join) → mini gold bordered button, same family as primary.
- **Wordmark** (`.brand-title`) → serif, uppercase, letter-spaced, gold with soft glow; `MERGE & MYSTERY` wide small-caps. Maps to the HEARTH logo lockup.
- **Order card** → parchment fill on 3px wood frame, serif villager name, ink body. Matches "ORDER CARD".
- **Coin display / energy pill** → gold circular token + tabular number. Matches "COIN DISPLAY".
- **Progress / gauges** → gold fill on dark track (energy gauge, map restoration, meditation timer). Matches "PROGRESS BAR".

## Per-screen notes

- **Home** — wordmark in the top bar; parchment order card; gold energy pill + coin pill; chunky gold Deliver. Auto-merge toggle in the tools bar now also **auto-delivers** completed orders. Recommend: swap emoji merge tiles for the 18 painted item icons (`item-<chain>-<n>.png`) and the harbour banner for `banner-harbour`.
- **Energy panel** — gold gauge, gold action buttons, teal-tinted Meditate/Recovery/Stargaze cards. Recommend: replace emoji action icons with `icon-<id>.png` gold-rimmed badges.
- **Map** — canvas homestead already staged 0–4; recommend swapping to painted `stage-<n>.png` behind `MapView.stage()`.
- **Villagers** — invite card, Bonfire Duel card, friend rows; gold/teal buttons. Recommend painted `avatar-<n>.png`.
- **Journal (Good Days)** — parchment-adjacent entry cards; gold Add / flashback claim.
- **Shop** — collection bars (teal→gold), event rows; primary CTA gold.
- **Modals** — Story, New Day (sunrise), Duel results use the panel gradient + gold flame + chunky buttons. Recommend the ornate wood-framed "POPUP WINDOW" treatment for confirm dialogs.
- **Duel** — gold/teal player sides, chunky Rematch/Deliver.

## Recommended next (asset-dependent)
Blocked on generated art (see `docs/art-bible.md`); the code hooks already exist so these are pure swaps:
1. **Merge item icons** (18) → `chainDef().levels` renders `<img>` instead of emoji.
2. **Homestead stages** (5) → `MapView` draws sprites over the procedural fallback.
3. **Action + UI + nav icons** → gold-rimmed badge components keyed by id.
4. **Parchment panels** — promote the dark list panels (earn rows, friend rows, loc rows) to the guide's parchment "PANEL" treatment once the paper texture (`tex-parchment`) exists, with ink text.
5. **Popup window frame** — 9-slice wood frame (`card-order-frame`) for confirm dialogs.
