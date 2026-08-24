import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/global.css'

const IN_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// 서비스 워커는 모바일 PWA 전용이다. 데스크톱 앱은 에셋이 exe 안에 들어 있어
// 오프라인 캐시가 필요 없고, 오히려 워커가 옛 번들을 붙들고 있으면 앱을
// 새로 설치해도 옛 화면이 그대로 뜬다. Tauri 안에서는 등록하지 않고,
// 예전 빌드가 남겨둔 워커가 있으면 캐시까지 걷어낸다.
if ('serviceWorker' in navigator) {
  if (IN_TAURI) {
    void navigator.serviceWorker.getRegistrations().then(async (regs) => {
      if (!regs.length) return
      await Promise.all(regs.map((r) => r.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      location.reload()
    })
  } else {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' })
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
