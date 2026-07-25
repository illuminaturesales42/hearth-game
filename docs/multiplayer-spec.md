# Track F — Real Multiplayer / Social Backend

**Goal:** make the social layer real — friends who actually exist, invites that actually work, gifts that actually come from someone.

**Honest framing:** this is the **largest track in the roadmap** and the only one that is primarily **backend engineering, not asset design**. It is also the biggest *faked* system in the game, so the gap between promise and reality is widest here.

---

## What is real vs faked today (verified)

### Faked
| Thing | Reality | Where |
|---|---|---|
| Friends | Seeded locally — Maya & Tomas are hardcoded | `src/core/social.ts:18-25` |
| Invites | Mint fake names from a local pool | `src/data/friends.ts:1` |
| "They joined" | A **free-energy faucet**, deliberately **tester-gated** so live players can't mint energy | `src/ui/social-screen.ts:48,124` (`canSimJoin = isTesterUnlimited`) |
| Gifts / "ask for help" | Items fabricated client-side | `src/core/social.ts:51-71` |
| Invite link | `https://hearth.game/join/${code}` — copied, leads nowhere | `src/ui/social-screen.ts:169` |

The code is candid: *"client-side simulation stub for the real multiplayer backend"* (`social.ts:2`) and the UI tells players *"Friends and trading are simulated in this build; the multiplayer service arrives in M3"* (`social-screen.ts:129`).

### Real (do not break)
- **Villager bonds** — hearts, memories, greetings (`src/core/relationships.ts`, `VILLAGER_DEFS`). This is the emotional core and is entirely local/NPC.
- **Town requests** — real economy.
- **Bonfire Duel** — a genuine local **hot-seat** 2-player game (`src/core/duel.ts`, `src/ui/duel.ts`). Same device, no network needed.

### The key architectural gift
> *"The Game API is the real contract; swapping in a server later doesn't touch this screen."* — `src/ui/social-screen.ts:7`

The UI is already written against `Game` methods. A backend can be introduced **behind** that contract without rewriting the screen.

---

## The one rule that governs this entire track

**Energy is never sold, and must never be mintable.** Hearth's whole premise is that energy comes from your real day. A social system that lets players fabricate friends to farm `JOIN_BONUS` destroys the game's integrity — which is exactly why the current faucet is tester-gated.

**Therefore: every energy or item grant must be server-authoritative.** No client may assert "a friend joined" or "a gift arrived."

---

## Scope

### F1 — Identity & accounts (prerequisite)
There is **no account system today** — saves are anonymous `localStorage` (`hearth:save`) with an optional cloud-sync layer (`src/platform/sync-*`).
- Needs: a durable player id, and a way to prove ownership across devices.
- Recommendation: **anonymous-first** (device-generated id, upgradeable later to an email/OAuth link) so onboarding stays frictionless and the game remains playable offline with no account at all.
- Privacy: display name is the avatar name (already player-chosen); **never** expose email or precise location.

### F2 — Friend graph & invites
- Real invite links: `hearth.game/join/<token>` → deep-link into the app, resolve token → pending friend request → **explicit accept by both sides**.
- Server holds the friend graph; client mirrors it read-only.
- Abuse controls: rate-limit invites, cap friend count, allow block/remove, expire unused tokens.

### F3 — Server-authoritative grants
Move these off the client entirely:
- `JOIN_BONUS` energy (currently `src/core/social.ts`)
- Gift/help item grants (`askFriend`, `HELP_ITEMS`)
- Rules: bonus paid **once per unique friendship**, both directions, idempotent; daily caps on help requests; server validates the requester actually has that task/chain.

### F4 — Presence & async social (recommended shape)
Full real-time presence is expensive and unnecessary for a cosy game. Prefer **asynchronous, mailbox-style** social:
- "Last seen" rather than live presence.
- Gifts land in the existing **Gifts inbox** (already in the UI) whenever the sender acted.
- This suits a wellness game's rhythm, needs no sockets, and works offline-first.

### F5 — Offline & merge behaviour
The game must remain **fully playable with no network**:
- Local save stays the source of truth for *your* village.
- Social state is a server-owned mirror, refreshed opportunistically; conflicts resolve server-side.
- Never block play on a failed social fetch (today's net-status handling in `src/ui/net-status.ts` is the precedent).

### F6 — Remove the simulation honestly
When real social ships: delete the tester faucet, the fake name pool (`src/data/friends.ts`), and the "simulated in this build" copy (`social-screen.ts:129`). Consider migrating existing simulated friends to a tidy empty state rather than silently deleting them — with a one-line explanation.

---

## New assets (few)

| Asset id | Use | Spec |
|---|---|---|
| `social_empty_state.png` | Illustration for "no friends yet" | Painted, warm, ~800×600 — an empty bench by the hearth; inviting, never sad |
| `icon_presence_on/off` *(optional)* | Last-seen dot | Small crafted icons (see Track A pipeline note) |
| *(reuses avatar portraits)* | Friend cards/faces | Friends show **their own chosen avatar portrait**, replacing the current `avatar_1..6` palette placeholders (`src/core/types.ts:115`) |

**Note:** once real accounts exist, `Friend.avatar` (a 1–6 palette int) should become the friend's real portrait id — a natural convergence with the avatar system.

---

## Code sketch

```
src/platform/social-provider.ts     (new — interface, mirrors notification/sync provider pattern)
  ├── LocalSimSocialProvider        (today's behaviour, kept for offline/dev)
  └── RemoteSocialProvider          (real backend)

src/core/social.ts                  → delegates to the provider; no fabrication
src/ui/social-screen.ts             → unchanged (already written against Game)
functions/                          → API routes (repo already has a functions/ dir + wrangler.toml)
```
The repo already deploys on **Cloudflare** (`wrangler.toml`, `functions/`) — the natural home for the API and a D1/KV-backed friend graph.

**Server endpoints (minimum):** create-invite · redeem-invite · list-friends · remove-friend · send-gift · claim-gift · request-help. All authenticated, all idempotent, all rate-limited.

---

## Acceptance checklist
- [ ] No client path can mint energy or items; all grants server-verified and idempotent
- [ ] Invite → accept → both see each other; bonus paid once per friendship
- [ ] Game fully playable offline; social failures never block play
- [ ] Rate limits, friend caps, block/remove, token expiry all enforced
- [ ] Simulation code + "simulated in this build" copy removed; existing fake friends handled gracefully
- [ ] Friends display real avatar portraits
- [ ] Villager bonds, town requests and hot-seat Duel **unaffected**
- [ ] `npx tsc --noEmit`, `npx vitest run` green

---

## Recommendation

Do this **last**. It is the highest-impact but highest-cost track, needs a real backend and ongoing operational care (abuse, moderation, uptime), and — unlike every other track — it cannot be shipped incrementally behind an art gate. Tracks A–E all make the game better for a solo player today; F only pays off once there is a player base to be social with.
