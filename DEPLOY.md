# Deploying Hearth — the permanent public URL

Hearth's web build is a static PWA. We publish it to **Cloudflare Pages** for a
permanent, always-fresh funnel URL (`hearth.pages.dev`) — this replaces the
`cloudflared` quick tunnels, which get a random address each launch and die
whenever the PC sleeps.

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
pnpm deploy                   # builds, then creates the 'hearth' project and publishes
```

The first `pnpm deploy` creates the Pages project and prints your live URL
(e.g. `https://hearth.pages.dev`). That URL is permanent — hand it to testers.
Re-run `pnpm deploy` any time to publish the latest build.

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

## Before soft launch (not now)

The service worker is currently **self-destroying** (`selfDestroying: true` in
[`vite.config.ts`](vite.config.ts)) so testers always get a fresh build with no
cache fights during rapid iteration. Flip it to the normal offline-first PWA
(`registerType: 'autoUpdate'` without `selfDestroying`) before the soft launch,
so the installed app works offline. Tracked in the roadmap (Phase C prep).

## Custom domain (optional, later)

Pages → the `hearth` project → **Custom domains** → add e.g. `play.hearth.app`
once a domain is registered. Not needed for testing.
