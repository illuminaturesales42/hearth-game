# HEARTH — Retention, Discovery Nudges & Notifications — Plan

*2026-07-18 · branch `feat/retention-nudges` off `main` · pillars: no-fail, cosy, no FOMO/guilt, reduce-motion honoured*

**Decisions locked:** (1) Notifications — build the provider abstraction + native Capacitor path + Settings opt-in now; it no-ops gracefully on the PWA and fires for real once the native build ships (no push server). (2) Glow markers — subtle & capped: soft slow pulse, **max ~3 live at once**, priority-ordered so only the most relevant un-tried things glow.

## Context

Hearth has no re-engagement layer and no way to draw a returning player toward the parts they haven't tried. This adds three things, sharing one spine: **glowing discovery markers** that quietly point at un-tried features, a **daily warm notification** that brings lapsed players back, and the **weekly Chronicle digest** surfaced when it's fresh. Everything pulls in one direction — a returner's eye lands on the next thing to discover, never on a guilt-trip.

Grounding facts from the codebase scan:
- **`composeWeek` already exists** (`chronicle.ts:145`) and renders as a `.chron-week` card atop Journal→Chronicle (`screens.ts:108`). The audit's "never built" claim (R2) is stale — only the *surfacing-when-fresh* nicety remains.
- **No notification infra at all** — no `@capacitor/local-notifications`, no web Notification usage. Must be built on the `pickHealthProvider()` pattern (`platform/providers.ts:34`).
- **No generic `discovered`/`seen` set** — add one via save migration (current `CURRENT_VERSION = 16`).
- Rich engagement state already exists to compute "hasn't tried X": `minigames.unlocked/bests`, `actions.counts`, `relationships`, `almanac`, `collectionsClaimed`, `wellbeing.lastCalmDay`, etc.

---

## Pillar A — Discovery glow markers (works on PWA today)

A small pulsing dot on a feature the player **hasn't engaged with yet**; it clears the instant they do and never returns. An invitation, not a badge count — never a number that shames.

### Engine — `src/core/discovery.ts` (new, pure + tested)
- `export function pendingNudges(state: GameState): NudgeId[]` — derives which feature-ids currently deserve a glow from the engagement fields, **minus** those already in `state.discovered`. Priority-ordered; caps at ~3 live glows so the map never lights up like a slot machine.
- Nudge sources (each a stable id):
  - `action:<id>` — an energy action the player has **never logged** (lifetime), so meditation/gratitude/stargaze get discovered.
  - `game:<id>` — a Village Life building that has **returned but never been played** (`returnsAt` met, no `minigames.bests[id]`).
  - `villager:<id>` — a villager who can be **met but hasn't** (`relationships[id]` absent once unlocked).
  - `almanac` — there are undiscovered Almanac pages the player could newly fill.
  - `week-digest:<weekKey>` — a fresh weekly digest they haven't opened (ties Pillar C in).
- `nudgesForScreen(state, screen)` — which pending nudges live under each bottom-nav screen (drives the nav dots).

### State + save
- `GameState.discovered?: readonly string[]` (optional → no presence-guard change, nothing to back-fill).
- Migration `16 → 17` in `save.ts`: `16: (s) => ({ ...s, version: 17, discovered: [] })`; bump `CURRENT_VERSION`. Default `[]` in `freshState()`.
- `Game.discover(id)`, `Game.isDiscovered(id)`, `Game.pendingNudges()` — `discover` appends + emits `state`.

### UI — `src/ui/glow-marker.ts` (new) + wiring
- `glowDot()` → a `<span class="glow-dot">` element; CSS pulse, **static ring under `body.reduce-motion`** (honours `forceReducedMotion`, `settings.ts:57`).
- Anchors:
  - **Bottom nav** (`app-shell.ts:62` nav loop) — append a dot to a `.nav-btn` when `nudgesForScreen()` is non-empty for its screen; re-evaluated on every `state`/`go()`.
  - **Energy actions** (`energy-panel.ts` `row()`) — dot on a never-used action row.
  - **Mini-games** — reuse the existing `badge` channel in `minigame-cta.ts:55` (already emits "✦ New"); extend so a returned-but-unplayed game keeps a soft glow until first play.
  - **Almanac** (`map-view.ts:2663` `almanacSection()`) — a gentle glow on the folded `<details>` summary when undiscovered pages exist.
- Each anchor calls `game.discover(id)` on interaction → glow dies.

---

## Pillar B — Daily re-engagement notification

One warm local notification/day, **opt-in**. Copy: *"The hearth is warm — your New Day awaits."* No streak threats, no countdowns, no FOMO.

### Provider — `src/platform/notification-provider.ts` (new, mirrors `pickHealthProvider`)
- Interface `NotificationProvider { requestPermission(): Promise<boolean>; scheduleDaily(hour, body): Promise<void>; cancelAll(): Promise<void> }`.
- `pickNotificationProvider()`:
  - **Native** (`isNativePlatform()` + `Capacitor.Plugins.LocalNotifications` bound) → real scheduled daily local notification. **This is the only path that reliably fires when the app is closed.**
  - **Web** → best-effort: `Notification` API (fires only while a tab/PWA is open, or via web-push if we add a service-worker push later); on unsupported (iOS-web pre-16.4) → **no-op**.
- Install `@capacitor/local-notifications`; add plugin block to `capacitor.config.ts`.

### Opt-in + scheduling
- `Prefs.notifyDaily?: boolean` + `notifyHour?: number` (default hour = the player's usual last-active hour, else 19:00).
- Settings toggle `#set-notif` (index.html + `settings.ts:22` pattern): on enable → `requestPermission()` then `scheduleDaily`; on disable → `cancelAll`. **Permission is requested only on opt-in, never on load.**
- Reschedule on `beginDay` / app-resume so it always points at the next day.

> **Delivery reality (decision needed — see below):** a scheduled daily notification that fires while the app is **closed** requires the **native Capacitor build** (or web-push infra). On the current **PWA** it can only notify while open. So this pillar's real value lands with the native/store build; the abstraction + Settings + native path get built now and simply no-op gracefully on PWA.

---

## Pillar C — Weekly digest, surfaced when fresh (small)

`composeWeek` + its card already exist. Only nicety: when a **new** week digest exists the player hasn't opened, raise a `week-digest:<weekKey>` nudge (Pillar A) so the **Journal nav dot glows** and, on a Sunday, the New-Day modal adds one line: *"Your week in Emberhollow is ready."* Opening Journal→Chronicle clears it. No new digest logic.

---

## Pillar D — The daily "what's new" line (ties it together)

Hook `NewDayUI.maybeShow()` (`new-day.ts:18`, runs once/day at first open): after the dawn reward, if `pendingNudges()` is non-empty, add **one** warm line pointing at the single most valuable un-tried thing (*"A new neighbour waits to be met."* / *"The forge has cooled — try Strike While Hot."*) and make sure that feature's glow is lit. One line, never a checklist.

---

## Checkpoints (each: prettier → tsc → vitest → build → deploy → verify)

1. **Discovery engine + state** — `core/discovery.ts` (pure, fully tested), `discovered` field, save 16→17 migration + test, `Game.discover/isDiscovered/pendingNudges`.
2. **Glow markers** — `glow-marker.ts` + CSS (+ reduce-motion), wire nav dots, energy-action glows, mini-game/almanac glows; each clears on interaction.
3. **Notifications** — provider (native + web + no-op), `@capacitor/local-notifications`, Settings opt-in toggle, schedule on enable/beginDay/resume; test the pure scheduling-decision fn.
4. **Digest surfacing + daily nudge line** — Pillar C nudge + Sunday New-Day line (Pillar D).
5. **QA + ship** — reduce-motion sweep, permission-denied path, opt-out clears schedule, glow-cap verified; build; deploy; PR → dev → main.

## Critical files
New: `src/core/discovery.ts`, `src/ui/glow-marker.ts`, `src/platform/notification-provider.ts`, `tests/discovery.test.ts`, `tests/notification-schedule.test.ts`.
Edit: `types.ts`, `game.ts`, `save.ts`, `app-shell.ts`, `energy-panel.ts`, `minigame-cta.ts`, `map-view.ts`, `settings.ts`, `new-day.ts`, `main.ts`, `index.html`, `styles.css`, `package.json`, `capacitor.config.ts`.

## Risks / decisions
- **Notification delivery** (native vs web-push vs defer) — the one real fork; see the decision below.
- **Permission UX** — request only on opt-in; a denied permission silently disables the toggle (no nag).
- **Glow overload** — hard cap live glows (~3), priority-ordered; each dies on first engagement and never returns.
- **Reduce-motion** — every glow has a static variant; the daily line/notification never animate aggressively.

## Verification
Each checkpoint: `npx tsc --noEmit` + `npx vitest run` + `npm run build` + deploy to the branch alias. Final: on `?tester`, confirm (a) a fresh profile shows glow dots on untried nav/actions/games that vanish on first use, (b) reduce-motion swaps pulse→static, (c) the Settings notification toggle requests permission and schedules/cancels, (d) the New-Day modal shows one warm nudge line, (e) opening Journal on a fresh-digest week clears the Journal glow.
