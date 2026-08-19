import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri는 고정 포트를 기대하므로 strictPort로 못박는다.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'TDLST',
        lang: 'ko',
        short_name: 'TDLST',
        description: '할 일 위젯',
        theme_color: '#0e0f13',
        background_color: '#0e0f13',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Supabase 응답은 캐싱하지 않는다. 오프라인 데이터는 IndexedDB가 담당.
        navigateFallbackDenylist: [/^\/auth/],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '0.0.0.0',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
