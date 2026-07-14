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
      registerType: 'autoUpdate',
      // TEST-BUILD SETTING: the offline precache was serving testers a stale
      // cached build no matter how many times they reloaded. A self-destroying
      // worker unregisters any existing SW and clears its caches, so every
      // load fetches fresh from the tunnel. Flip back to false for the
      // production launch build to restore offline play + installability.
      selfDestroying: true,
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
        // PNGs. This is the fix that must land before selfDestroying flips to
        // false for launch: otherwise every SW install would download all 400+
        // sprites up front (minutes on 3G, likely eviction on low-end phones)
        // and re-validate the whole manifest on any single art change.
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'icons/*.png', 'favicon*.png', 'apple-touch-icon.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Art is fetched lazily and cached on first use, with a bounded cache.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/art/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'hearth-art',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
