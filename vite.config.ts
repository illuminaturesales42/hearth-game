import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
          'A cozy merge-adventure where real-life actions power your village. Restore Emberhollow — energy is earned from your day, never sold.',
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
