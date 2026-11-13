import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'NYC Litter Basket Locator',
        short_name: 'Basket Locator',
        description: 'Browse official NYC litter basket locations.',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'en-US',
        orientation: 'portrait-primary',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '64x64',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.endsWith('/data/basket-inventory.json'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'nyc-litter-basket-inventory',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
