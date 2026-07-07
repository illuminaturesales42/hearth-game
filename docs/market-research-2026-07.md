# Hearth — Indie Market Research & Profitability Route (July 2026)

Synthesis of four parallel deep-research passes: small-team case studies, go-to-market playbook, wellness/merge monetization comparables, and pitfalls/platform strategy. Sources inline.

---

## 1. What successful tiny teams actually did

| Game | Team | Dev time | Outcome | Credited decisions |
|---|---|---|---|---|
| Balatro | 1 + publisher | ~3 yr | 5M copies, $600k in first hours | Unlimited demo → 208k launch wishlists; influencer targeting by adjacent-game audience; one compulsive loop |
| Vampire Survivors | 1 | ~1 yr, £1,100 budget | Tens of millions of units | $2.99 impulse price; streamer-friendliness; started as free browser game |
| Stardew Valley | 1 | 4.5 yr | 41M copies | Starved niche (Harvest Moon on PC); years of devlog community |
| A Short Hike | 1 | 4 months | ~$2.2M | Drastic scope cut after burnout; Humble deal de-risked |
| Unpacking | 2–4 | 3.5 yr | 1M copies yr 1 | One hyper-shareable hook; Wholesome Games ecosystem |
| Rusty's Retirement | 1 | short | 550k+ copies | Novel ambient format visible on streams all day |
| Finch | small, bootstrapped | ongoing | **$30–40M ARR, no VC** | Emotional pet attachment; soft paywall; TikTok UGC testimonial ads |

Cross-cutting: **one hook legible in a 10-second clip; streamers/Shorts (not press) are the discovery channel; scope in months not years; proven genre + twist; solo dev ≠ solo launch.**

Base rates: median 2025 Steam release grossed **~$249**; ~20k releases/yr, ~300 cross $1M; top 1% take ~90% of indie revenue. Success is bimodal — plan for repeated cheap shots on goal.

Sources: [LocalThunk timeline](https://localthunk.com/blog/balatro-timeline-3aarh), [GameDiscoverCo Balatro](https://newsletter.gamediscover.co/p/how-balatro-hit-1-million-sales-in), [Zukowski 2025 review](https://howtomarketagame.com/2026/01/27/what-the-hell-happened-in-2025/), [Sparrow Finch deep dive](https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money)

## 2. Platform verdict for Hearth

- **Skip Steam.** Merge/match demand on Steam is near-zero ("poison pill"); the merge-story audience — women 30+, casual, session-snacking — lives on **mobile and web**. ([Zukowski genre analysis](https://howtomarketagame.com/2023/11/14/what-games-should-former-aaa-developers-make-when-they-go-indie/), [Naavik Gossip Harbor](https://naavik.co/digest/gossip-harbors-meteoric-rise-in-merge/))
- **PWA alone cannot carry the product**: no web API reads steps/sleep (the core loop), and iOS evicts script-writable storage after 7 days of disuse → **cloud saves are mandatory**, and the **Capacitor wrap with real HealthKit/Health Connect integration is the true launch platform**. The native health integration also defeats Apple Guideline 4.2 (minimum functionality) rejections for wrapped apps. ([MagicBell iOS PWA limits](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [Apple guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **Web tier = funnel, not revenue**: Poki (100M MAU) / CrazyGames / itch pay $500–3k/mo typical; use web for frictionless trial, playtests, and mailing-list capture. Poki pays 100% on traffic you bring yourself. ([Poki monetization](https://developers.poki.com/guide/monetization))
- **Health-data policy:** Apple 5.1.3 — health data may never feed ads/data-mining, never stored in iCloud; per-datatype purpose strings + privacy policy required. Google Fit is dead (full deprecation end 2026) — use **Health Connect** or the account-free Recording API. Precedent that games qualify: Pikmin Bloom uses HealthKit for background steps. Never target kids categories with health data (COPPA). ([Android migration](https://developer.android.com/health-and-fitness/health-connect/migration/fit))

## 3. Monetization: the ethical spine that actually works

Hearth's "energy is never sold" rule is not a handicap — it's Finch's exact positioning, and Finch out-earns VC-funded rivals per dollar raised.

1. **Subscription is the proven backbone**: $4.99–9.99/mo, $40–80/yr, 7-day trial, **annual plans carry the revenue** (68% of health-app sub revenue). Expect 1–5% install→paid; ~40% trial→paid median; ~30% month-1 annual churn; iOS converts ~2× Android. ([RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025/))
2. **Seasonal/chapter pass is the highest-converting ethical add-on**: 5–10% attach (15–20% when well-timed) at $4.99–9.99/season — maps perfectly onto Hearth's story chapters (Ch2–8 Alden Vale arc). Pass owners retain 3× longer. ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/2022/6/4/battle-passes-analysis))
3. **Cosmetics supplement, can't lead** below ~100k MAU (homestead decor, pet/companion outfits — Finch-style).
4. **One-time premium unlock is the worst model** (D60 revenue-per-install $0.24 vs $3.09 for hard-paywall subs) and can't fund live content — Zombies, Run! abandoned it in 2014.
5. Goodwill moats that comparables proved: Finch's pay-it-forward subsidized subs; Forest's 2M real trees planted. A real-world-impact hook fits Hearth's brand.

Honest ceiling check: energy-selling merge factories (Gossip Harbor $677M, Merge Mansion $700M) are UA-funded machines we cannot and should not compete with. Ethical wellness leaders: Finch $30–40M ARR (outlier), Habitica ~$5M/yr lifestyle business, Zombies Run ~$6.65M exit after a decade as category leader. **Realistic 2-person success = a Habitica/Zombies-Run-shaped sustainable business, with Finch as the ceiling.**

Retention math favors us: top habit apps hit **D30 40%+ vs ~3% for merge games** — genuine habit change is a 10× retention moat that substitutes for UA spend.

## 4. Pitfalls to avoid (ranked by kill-rate)

1. **Launching to zero audience** — the #1 documented killer. Audience building starts now, not at launch.
2. **Scope creep / burnout** — >70% of failed indies cite scope; MVP is code-complete, so the risk is post-MVP feature sprawl. Keep day jobs (Mastermind); 67% of indies fund from savings/other income.
3. **Paid UA** — casual CPI $2.50–4.22 iOS; unviable without portfolio-scale data. Never buy installs.
4. **Ads mixed with health data** — instant policy violation (5.1.3). If ads ever enter, hard-wall them from health signals; better: no ads at all (on-brand).
5. **Launching globally without retention proof** — soft launch PH/CA/NZ first; gate global on **D1 ≥ 30–40%, D7 15–20%, D30 ≥ 4%**. Below D1 20%, nothing saves it.
6. **Google Play new-account friction**: 12+ testers for 14 days closed testing required.

## 5. Recommended route to profitability

**Phase A — Audience while polishing (now → +2 months)**
- Cloudflare Pages PWA live as the free, frictionless funnel; email list capture in-app ("get the next chapter first"). Email > Discord for launch conversion.
- Start the content engine: 3–5 Shorts/TikToks per week — "day X building a game where your real morning walk warms a village" is a natural UGC hook (Finch's growth engine was exactly this testimonial format; Usagi Shima and Sticky Business are the solo-dev precedents). YouTube Shorts is now the more stable algorithm than TikTok.
- Plug into the **Wholesome Games ecosystem** (their showcase partnership, not TikTok, was Minami Lane's spike).
- A memorable, searchable name matters — ~48% of viewers search the name directly. "Hearth: Merge & Mystery" is searchable; check collisions.

**Phase B — Native wrap + cloud saves (+1–3 months)**
- `npx cap add` (iOS needs a Mac), HealthKit + Health Connect adapters behind the existing health-adapter interface, push notifications, cloud save sync (non-negotiable given iOS eviction).
- Privacy policy, purpose strings, Data Safety forms prepared early — health apps get rejected on paperwork.

**Phase C — Soft launch (PH/CA/NZ/AU)**
- Free download, no monetization yet; measure D1/D7/D30 against the gates above; iterate FTUE and the day-2 return loop until D1 ≥ 30%.

**Phase D — Monetize + global**
- "Hearth Keeper" subscription $4.99–6.99/mo, ~$39.99/yr, 7-day trial: cosmetic homestead depth, Chronicle export, extra chapter content — never energy, never gameplay power.
- Chapter/season pass per story arc at ~$4.99 as the second stream.
- Apple featuring nomination (App Store Connect, ≥2 weeks ahead; wellness + no-dark-patterns story is exactly the editorial angle Apple features) and Google Play Indie Games Corner.
- Pay-it-forward subsidized subs as the community goodwill mechanic.

**North-star metrics:** email list size pre-launch; D1/D7/D30 in soft launch; trial→paid ≥ 30%; one 10-second clip that reliably makes strangers say "oh that's lovely."
