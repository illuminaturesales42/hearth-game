# Deploying Hearth — the permanent public URL

Hearth's web build is a static PWA. We publish it to **Cloudflare Pages** for a
permanent, always-fresh funnel URL (e.g. `hearth-emberhollow.pages.dev`) — this
replaces the `cloudflared` quick tunnels, which get a random address each launch
and die whenever the PC sleeps.

> ⚠️ **`hearth.pages.dev` is NOT ours.** Cloudflare `*.pages.dev` subdomains are
> globally first-come, and the bare name `hearth` was already taken by an
> unrelated account (it serves a parked/affiliate page). The project is named
> `hearth-emberhollow` in [`wrangler.toml`](wrangler.toml); the real URL is
> whatever `pnpm deploy` prints. If that name is taken too, change it and
> redeploy. Never hand testers `hearth.pages.dev`.

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
pnpm deploy                   # builds, creates the 'hearth-emberhollow' project, publishes
```

The first `pnpm deploy` creates the Pages project and **prints your live URL**
(e.g. `https://hearth-emberhollow.pages.dev`). Use the URL it prints — that one
is yours and permanent. Hand testers that URL with `?tester` appended. Re-run
`pnpm deploy` any time to publish the latest build.

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
