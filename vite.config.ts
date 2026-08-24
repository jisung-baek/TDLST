import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tauri는 고정 포트를 기대하므로 strictPort로 못박는다.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 등록은 main.tsx 에서 직접 한다. 여기서 script 를 심으면 Tauri 안에서도
      // 워커가 붙어, exe 에 박아 넣은 새 번들을 옛 캐시가 가려버린다.
      injectRegister: null,
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'TDLST',
        lang: 'ko',
        short_name: 'TDLST',
        description: '할 일 위젯',
        theme_color: '#ffffff',
        background_color: '#ffffff',
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
        // Pretendard 는 92개 유니코드 서브셋으로 쪼개져 있다. 전부 미리 받으면
        // 3.5MB 인데 실제로 쓰이는 건 한글·라틴 몇 개뿐이라, 처음 쓸 때 받아서 캐싱한다.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tdlst-fonts',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
