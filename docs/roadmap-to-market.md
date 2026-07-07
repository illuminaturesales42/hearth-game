# Hearth — Roadmap to Market

*v1.0 · 2026-07-07 · Consolidates `market-research-2026-07.md` (strategy), `mvp-upgrade-plan.md` (product), and the GDD production plan into one sequenced route. Timelines are estimates for a 2-person team with day jobs — checkpoints, not promises.*

**The one-line plan:** free web PWA as the funnel and testbed → audience built in public → native app with real health data and cloud saves → soft launch gated on retention → ethical monetization (subscription + chapter pass; energy is never sold) → global.

**North-star metrics** (in order): email list size pre-launch · soft-launch D1 ≥ 30–40% / D7 15–20% / D30 ≥ 4% · trial→paid ≥ 30% · one 10-second clip that reliably makes strangers say "oh, that's lovely."

---

## Phase 0 — Finish the MVP web build *(now → ~2–4 weeks)*

The product work left before we point strangers at it.

| Item | Status / gap |
|---|---|
| Permanent public URL | **Blocked on a 1-time human step:** `wrangler login`, then `npx wrangler pages deploy dist --project-name hearth` (or connect the GitHub repo to Cloudflare Pages). The quick tunnel dies when the PC sleeps. |
| Real email list | Card ships in-app but points at a mailto. Stand up Buttondown/MailerLite (free tiers) and swap `LIST_EMAIL` in `src/ui/growth.ts` for the form/endpoint. |
| Building upgrades L2/L3 | Needs a probe/slice pass on the batch567 sheet (6.1 upgrade sets), then the coin-sink mechanic. Second long-term sink after decor. |
| Ember-heart energy pill | `UI Flame.png` shows the sanctioned energy visual ("ember, not lightning"). Slice + swap into the top bar. |
| Playwright smoke in CI | launch → merge → deliver → reload persists. Guards every deploy. |
| Lighthouse pass | ≥90 PWA/perf on a mid-range phone; image lazy-load audit now that art count is 120+. |
| Balancing from real data | Friends-and-family week using `hearthEvents()` exports; tune HEALTH_RULES, action energies, order rewards. |
| Content copy audit | British spelling, voice pass over all orders/chronicle pools (docs' voice rules). |

**Exit gate:** 5+ external testers complete FTUE + Chapter 1 unaided; zero save-loss reports; the tunnel replaced by a real URL.

## Phase A — Audience while polishing *(starts now, never stops)*

Launching to zero audience is the #1 documented indie killer. This runs in parallel with everything below.

- **Content engine:** 3–5 Shorts/TikToks per week. The natural hook is the product itself: *"building a game where your real morning walk warms a village."* Devlog + town-growth timelapses + Share-my-town cards. YouTube Shorts is currently the more stable algorithm than TikTok.
- **Wholesome Games ecosystem:** apply for their showcases early (that partnership, not virality, was Minami Lane's spike). Also: Cozy Games communities, r/CozyGamers, wholesome Discords.
- **Email list** ("get the next chapter first") as the primary launch asset — email converts to launch-day action far better than Discord.
- **Name check:** "Hearth: Merge & Mystery" — verify store-name collisions before committing store listings (~48% of viewers search the name directly).
- **In-app funnel already shipped:** email card, Share-my-town, install prompts.

**Milestone:** 500–1,000 emails before soft launch. If content isn't landing after 8 weeks, iterate the clip format, not the game.

## Phase B — Native wrap: the real platform *(+1–3 months, overlaps Phase 0/A)*

The PWA can't read steps or sleep, and iOS evicts web storage after 7 quiet days — **the Capacitor app with real health integration and cloud saves is the actual product.** Native health integration also defeats Apple's 4.2 minimum-functionality rejections for wrapped apps (precedent: Pikmin Bloom).

1. `npx cap add android` first (buildable on the Windows box today); iOS needs a Mac — plan for one (Mac mini / MacinCloud) before Phase C.
2. HealthKit + Health Connect adapters behind the existing `health-provider` interface (Google Fit is dead end-2026 — Health Connect only).
3. **Cloud saves — non-negotiable** before real testers on phones. Smallest honest version: account-keyed save sync (the export JSON is already the payload). **Architecture landed:** `src/platform/sync-provider.ts` (provider seam + pure `resolveSync` conflict policy + device-mirror & in-memory impls) and `sync-controller.ts` (pull-and-reconcile on launch, debounced push, never silently overwrites — conflicts go to the player). The account-backed HTTP provider is now a drop-in: implement `SyncProvider.pull/push` against the endpoint and swap it in `main.ts`. `pickHealthProvider()` in `providers.ts` already selects HealthKit/Health Connect at runtime on native.
4. Push notifications, gentle and opt-in only (sunrise New Day; never guilt).
5. Paperwork early — health apps get rejected on it, not code: privacy policy, per-datatype purpose strings, Play Data-Safety form, Apple 5.1.3 compliance (health data never feeds ads/analytics, never in iCloud).
6. Google Play new-account friction: 12+ testers for 14 days of closed testing is mandatory — recruit from the email list.

## Phase C — Soft launch *(PH / CA / NZ / AU, ~1–2 months of iteration)*

- Free, no monetization yet. Measure D1/D7/D30 against the gates above.
- Iterate FTUE and the day-2 return loop until D1 ≥ 30%. Below D1 20%, stop and rework — nothing downstream saves a game that doesn't come back on day two.
- Instrument with the existing analytics taxonomy; add a real sink (PostHog/Amplitude free tier) behind the current facade. **Landed:** on-device retention (`src/core/retention.ts` — D1/D7/D30, streaks, FTUE funnel; `window.hearthMetrics()` dashboard; `retention_day`/`ftue_step`/`ftue_complete` events). The gate is now measurable per device during friends-and-family week; the server just aggregates the same records. Only the network sink remains to swap in via `setSink()`.

## Phase D — Monetize + global launch

- **"Hearth Keeper" subscription** $4.99–6.99/mo, ~$39.99/yr, 7-day trial. Contents: cosmetic homestead depth, Chronicle export/keepsakes, extra decor sets — **never energy, never gameplay power.** Annual plans carry the revenue (68% of health-app sub revenue).
- **Chapter/season pass** ~$4.99 per story arc (Ch. 3+, the Alden Vale mystery), 5–10% expected attach, pass owners retain ~3× longer.
- **Pay-it-forward subsidized subs** — the community goodwill mechanic (Finch's model).
- **Featuring:** Apple featuring nomination via App Store Connect ≥2 weeks ahead (wellness + no-dark-patterns is exactly Apple's editorial angle); Google Play Indie Games Corner.
- Global rollout only after soft-launch gates hold.

## What we never do (the moat, not the handicap)

No energy sales · no gems · no ads near health data (ideally no ads at all) · no paid UA (casual CPI $2.50–4.22 makes it unviable at our scale) · no dark patterns (Hearth Test on every feature). Honest ceiling: a Habitica/Zombies-Run-shaped sustainable business ($1–6M/yr) with Finch ($30–40M ARR) as the proven ceiling for exactly this ethical positioning.

## Risks

| Risk | Mitigation |
|---|---|
| Zero-audience launch | Phase A starts now; email list is the gate for soft launch |
| iOS storage eviction eats a tester's save | Install prompts + export nudges shipped; cloud saves in Phase B before phone testers |
| Scope creep (the design pack describes a full game) | MVP-lite rule stands; new features pass the Hearth Test and fit a named phase |
| Apple health-policy rejection | Paperwork checklist in Phase B §5; never mix ads and health |
| Burnout (2 people, day jobs) | Phases overlap but nothing hard-gates on a date; Mastermind stays primary income |

## This week's actionable shortlist

1. ☐ `wrangler login` → permanent URL (5 minutes, human-only step).
2. ☐ Create Buttondown list → swap `LIST_EMAIL`.
3. ☐ First devlog Short: town-growth timelapse from the composed map.
4. ☐ Recruit 5 friends-and-family testers onto the permanent URL.
5. ☐ Slice batch567 upgrade sets (next build session).
