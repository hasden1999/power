import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    basicSsl(),
    react(),
    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'نظام المولدات الأهلية - جباية وإدارة المشتركين',
        short_name: 'المولدة',
        description: 'نظام ساس لإدارة المولدات الأهلية والتحصيل الميداني في العراق أوفلاين وأونلاين',
        theme_color: '#0f172a',
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
  server: {
    host: true, // يتيح الاتصال من الهاتف والأجهزة المتصلة بنفس شبكة الواي فاي
    port: 5173,
  },
});


