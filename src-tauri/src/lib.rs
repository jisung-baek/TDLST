mod oauth;

use tauri::Manager;

/// 위젯 창을 바탕화면 층에 앉히거나 다시 끌어올린다.
///
/// 항상 맨 위가 아니라 항상 맨 아래다. 다른 창을 열면 가려지고,
/// `Win+D` / `Win+M` 으로 창을 치우면 드러난다.
/// 최소화를 막아둔 것도 같은 이유다 — 모든 창 최소화에 휩쓸리면 안 된다.
///
/// 다만 이 상태를 계속 걸어두면 안 된다. tao 는 `ALWAYS_ON_BOTTOM` 이 켜져 있는 한
/// `WM_WINDOWPOSCHANGING` 이 올 때마다 `hwndInsertAfter` 를 `HWND_BOTTOM` 으로
/// 덮어쓴다. 클릭으로 창을 활성화할 때 Windows 가 창을 올리려는 것도 같은 메시지를
/// 타므로, 활성화와 z-order 가 매번 싸운다. `HWND_BOTTOM` 은 바탕화면 셸 창
/// (`Progman` / `WorkerW`) 보다도 아래라, 싸움에서 지면 클릭이 위젯을 지나쳐
/// 바탕화면으로 빠진다. 입력란에 커서가 안 잡히던 이유가 이것이다.
/// 창을 끄는 동안엔 매 프레임 재삽입이 일어나 드래그도 눈에 띄게 느려진다.
///
/// 그래서 포커스를 잡고 있는 동안에는 고정을 풀고, 놓는 순간 다시 앉힌다.
/// 바탕화면 위젯이라는 성질은 그대로면서, 만지는 동안엔 평범한 창처럼 군다.
fn pin_to_desktop(window: &tauri::WebviewWindow, pinned: bool) {
    let _ = window.set_always_on_bottom(pinned);
}

/// 시작프로그램에 등록돼 있는지 읽는다.
#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// 시작프로그램 등록을 켜고 끈다.
///
/// 알아서 켜지 않는 이유가 있다. 동의 없이 `HKCU\...\Run` 에 자기를 등록하는 건
/// 백신이 애드웨어로 진단하는 행동 패턴이고, 사용자에게도 예의가 아니다.
/// 켜고 끄는 건 상태 표시줄의 토글로만 한다.
#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|e| format!("시작프로그램 설정 실패: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 반드시 첫 번째로 등록한다.
        //
        // WebView2 는 사용자 데이터 폴더를 한 프로세스만 잠글 수 있다. 두 번째
        // 인스턴스는 웹뷰를 만들지 못한 채 창만 띄우는데, 창이 투명해서
        // 배경화면과 구분되지 않는다. 그래서 애초에 두 번째를 만들지 않는다.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            //
            // 되찾기 수단이기도 하다. 바탕화면에 고정된 창은 작업표시줄로도
            // Alt+Tab 으로도 앞으로 나오지 않는다. 모니터를 바꿔 창이 화면 밖으로
            // 나가면 손쓸 방법이 없으므로, 다시 실행하면 고정을 풀고 가운데로 끌어온다.
            if let Some(window) = app.get_webview_window("main") {
                pin_to_desktop(&window, false);
                let _ = window.unminimize();
                let _ = window.center();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // 창 위치와 크기를 종료 시 기억한다
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // 로그인 때 시스템 기본 브라우저를 여는 데 쓴다
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            oauth::wait_for_oauth_code,
            autostart_enabled,
            set_autostart
        ])
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main 창이 설정에 없습니다");

            // Windows 에서 이 설정은 WS_EX_TOOLWINDOW 를 붙여 Alt+Tab 목록에서도 빼준다.
            // z-order 와 달리 한 번만 걸면 되는 성질이다.
            let _ = window.set_skip_taskbar(true);
            pin_to_desktop(&window, true);

            // 아크릴은 tauri.conf.json 의 windowEffects 가 창을 만들 때 이미 건다.
            // 여기서 apply_acrylic 을 또 부르면 같은 효과를 두 번 거는 셈이라 뺐다.

            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(focused) = event {
                    if let Some(window) = handle.get_webview_window("main") {
                        pin_to_desktop(&window, !focused);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("TDLST 실행 실패");
}
