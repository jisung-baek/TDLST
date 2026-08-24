import { useState } from 'react'
import { supabase } from '../lib/supabase.ts'

const IN_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** 데스크톱 로그인 콜백을 받는 로컬 포트. Supabase Redirect URLs 에 등록해야 한다. */
const DESKTOP_CALLBACK = 'http://localhost:14237'

/**
 * 브라우저에서는 평범하게 리디렉트시키면 된다.
 *
 * 데스크톱은 사정이 다르다. 구글이 앱 내장 웹뷰에서의 OAuth 를 거부하기 때문에
 * 위젯 안에서 로그인 창을 열면 차단당한다. 그래서 시스템 기본 브라우저로 내보내고,
 * 앱은 로컬 포트를 잠깐 열어 인증 코드가 돌아오기를 기다린다.
 * (OAuth 2.0 for Native Apps, RFC 8252 의 loopback 방식)
 */
async function signInDesktop() {
  const { invoke } = await import('@tauri-apps/api/core')
  const { openUrl } = await import('@tauri-apps/plugin-opener')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: DESKTOP_CALLBACK, skipBrowserRedirect: true },
  })
  if (error) throw error
  if (!data.url) throw new Error('인증 주소를 받지 못했습니다')

  // 브라우저를 열기 전에 리스너부터 띄운다
  const codePromise = invoke<string>('wait_for_oauth_code')
  await openUrl(data.url)

  const code = await codePromise
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) throw exchangeError
}

async function signInBrowser() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

export default function Login() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await (IN_TAURI ? signInDesktop() : signInBrowser())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div>
        <h1>TDLST</h1>
        <p>노트북과 폰이 같은 목록을 봅니다.</p>
        <button onClick={signIn} disabled={busy}>
          {busy ? (IN_TAURI ? '브라우저에서 로그인 중…' : '여는 중…') : 'Google 계정으로 계속'}
        </button>
        {busy && IN_TAURI && (
          <p className="hint">브라우저 창에서 로그인을 마치면 이 화면이 넘어갑니다.</p>
        )}
        {/* 단색 시스템이라 오류도 붉지 않다. 농도와 굵기로만 올린다. */}
        {error && <p className="hint error">{error}</p>}
        {/* 창 장식이 없어서 로그인 전에는 이 버튼 말고 위젯을 끌 방법이 없다 */}
        {IN_TAURI && (
          <p className="hint">
            <button
              onClick={() => {
                void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
                  getCurrentWindow().close(),
                )
              }}
            >
              위젯 끄기
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
