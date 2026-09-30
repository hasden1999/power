import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    basicSsl(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6MB for SQLite WASM and local fonts
      },
      includeAssets: [
        'favicon.svg',
        'icons.svg',
        'fonts/*.woff2',
        'wasm/*.wasm',
      ],
      manifest: {
        name: 'أمبيرجي (نظام إدارة المولدات الأهلية)',
        short_name: 'أمبيرجي',
        description: 'نظام إدارة المولدات الأهلية والجباية الميدانية في العراق أوفلاين 100%',
        theme_color: '#0E7490',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: true,
    port: 4173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
