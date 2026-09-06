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
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'نظام المولدات الأهلية - جباية وإدارة المشتركين',
        short_name: 'المولدة',
        description: 'نظام ساس لإدارة المولدات الأهلية والتحصيل الميداني في العراق أوفلاين وأونلاين',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        dir: 'rtl',
        lang: 'ar',
      },
    }),
  ],
  server: {
    host: true, // يتيح الاتصال من الهاتف والأجهزة المتصلة بنفس شبكة الواي فاي
    port: 5173,
  },
});


