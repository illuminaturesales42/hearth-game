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
      includeAssets: ['art/*.png', 'icons/*.png'],
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
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // The whole game is offline-first; art is precached with the shell.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
