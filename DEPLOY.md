# Deploying Hearth — the permanent public URL

Hearth's web build is a static PWA published to **Cloudflare Pages**. The live
funnel URL is **https://hearth-5q8.pages.dev** (hand testers that + `?tester`).

> ⚠️ **Use `hearth-5q8.pages.dev`, never `hearth.pages.dev`.** Cloudflare
> `*.pages.dev` names are globally first-come; the bare `hearth` was already
> taken by an unrelated account (it serves a parked/affiliate page), so ours
> got the `-5q8` suffix. The project is named `hearth-5q8` in
> [`wrangler.toml`](wrangler.toml) — keep it that way so `pnpm deploy` updates
> the existing site instead of minting a new URL.

Everything below is already wired: `wrangler` is a dev dependency,
[`wrangler.toml`](wrangler.toml) names the project and points at `dist`, the
`deploy` npm script builds + publishes, and
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) auto-publishes on
every push to `main`. Only the **one-time account setup** below is human-only.

---

## One-time setup (pick one path)

### Path A — deploy from your machine (fastest, ~5 min)

```bash
cd "F:/Mastermind launch/hearth"
pnpm exec wrangler login      # opens a browser; approve once
pnpm deploy                   # builds + publishes to the 'hearth-5q8' project
```

`pnpm deploy` republishes to **https://hearth-5q8.pages.dev** — the same URL
testers already have, now with the latest build. Re-run any time to publish.
Testers open it with `?tester` appended.

### Path B — auto-deploy on every push to `main` (set-and-forget)

1. In the Cloudflare dashboard: **My Profile → API Tokens → Create Token →**
   "Edit Cloudflare Workers" template (or a custom token with **Account →
   Cloudflare Pages → Edit**). Copy the token.
2. Grab your **Account ID** (Workers & Pages → any page, right sidebar).
3. In the GitHub repo (`illuminaturesales42/hearth-game`) → **Settings →
   Secrets and variables → Actions**:
   - Secret `CLOUDFLARE_API_TOKEN` = the token from step 1
   - Secret `CLOUDFLARE_ACCOUNT_ID` = your Account ID
   - **Variable** `CLOUDFLARE_ENABLED` = `true`  *(this flips the workflow on)*
4. Do the **first** deploy once via Path A (`pnpm deploy`) so the `hearth`
   project exists, then every push to `main` publishes automatically.

> The workflow is gated on `CLOUDFLARE_ENABLED == 'true'`, so until you set that
> variable it stays dormant — CI never fails red for a half-configured repo.

---

## Everyday use

| I want to… | Do this |
|---|---|
| Publish the latest build now | `pnpm deploy` |
| Publish a throwaway preview | `pnpm deploy:preview` (deploys to a `preview` branch URL) |
| Auto-publish on merge to main | Nothing — Path B does it on push |

## Cloud saves (the /v1/save sync API)

Cloud saves ship **with the site**: [`functions/v1/save.ts`](functions/v1/save.ts)
is a Pages Function deployed automatically by every `pnpm deploy`, backed by
the `hearth-saves` D1 database declared in [`wrangler.toml`](wrangler.toml)
(binding `DB`; database + table already created — commands are in that file's
comments). The client (`HttpSyncProvider`) talks to it same-origin with an
anonymous device key, so there is no separate API deploy, domain, or CORS
setup to maintain. Inspect data with
`pnpm exec wrangler d1 execute hearth-saves --remote --command "SELECT device_key, rev, updated_at, length(save) FROM saves"`.

## Service worker

The service worker is the normal offline-first PWA: `registerType: 'prompt'`
with `selfDestroying: false` in [`vite.config.ts`](vite.config.ts). The shell
is precached; art is served `StaleWhileRevalidate`. Normal players get a gentle
"refresh for the new version" banner; testers (opted in via `?tester`) auto-
apply updates. (This section previously described a self-destroying worker —
that was retired in the July audit-fix pass.)

## Custom domain (optional, later)

Pages → the `hearth` project → **Custom domains** → add e.g. `play.hearth.app`
once a domain is registered. Not needed for testing.
