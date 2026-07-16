import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Vitest runs the pure-logic unit suite only; the Playwright e2e specs in
  // tests/e2e/*.spec.ts are driven by playwright.config.ts, not vitest.
  test: {
    include: ['tests/**/*.test.ts'],
  },
  preview: {
    // local static preview, exposed only via tunnels for remote phone testing
    allowedHosts: true,
  },
  plugins: [
    VitePWA({
      // 'prompt': a new deploy installs the fresh SW but waits for the player
      // to tap the in-app "Refresh" banner (wired in main.ts via
      // virtual:pwa-register) — open tabs never silently keep a stale shell,
      // and nothing reloads under the player's feet. This replaces the old
      // 'autoUpdate' + self-destroying-SW combo that masked the stale-cache
      // problem by disabling offline entirely.
      registerType: 'prompt',
      selfDestroying: false,
      // Shell assets only — the ~44 MB of art in /art is cached lazily at
      // runtime (see workbox.runtimeCaching), never precached with the shell.
      includeAssets: ['icons/*.png', 'favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hearth: Merge & Mystery',
        short_name: 'Hearth',
        description:
          'A cosy merge-adventure where real-life actions power your village. Restore Emberhollow — energy is earned from your day, never sold.',
        theme_color: '#0f1626',
        background_color: '#0d1322',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the SHELL only (JS/CSS/HTML + icons) — NOT the ~44 MB of art
        // PNGs; otherwise every SW install would download all 400+ sprites up
        // front (minutes on 3G, likely eviction on low-end phones) and
        // re-validate the whole manifest on any single art change.
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'icons/*.png', 'favicon*.png', 'apple-touch-icon.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Art is fetched lazily and cached on first use, with a bounded cache.
        // StaleWhileRevalidate (not CacheFirst): art filenames are stable and
        // unhashed, so CacheFirst served redrawn sprites stale for up to 30
        // days after a deploy. SWR answers instantly from cache AND refreshes
        // in the background — the next view shows the new art.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/art/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'hearth-art',
              expiration: { maxEntries: 500 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
