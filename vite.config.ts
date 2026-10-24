import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: { name: 'Exam Affairs Daily', short_name: 'ExamAffairs', description: 'Verified daily current affairs for Indian competitive exams',
      theme_color: '#14213d', background_color: '#f5f7f8', display: 'standalone', start_url: './', scope: './',
      icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] },
    workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'], navigateFallback: 'index.html' }
  })],
  test: { environment: 'node' }
});
