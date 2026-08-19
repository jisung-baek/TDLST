mod oauth;

use tauri::Manager;

#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;

/// 위젯 창을 바탕화면 층에 앉힌다.
///
/// 항상 맨 위가 아니라 항상 맨 아래다. 다른 창을 열면 가려지고,
/// `Win+D` / `Win+M` 으로 창을 치우면 드러난다.
/// 최소화를 막아둔 것도 같은 이유다 — 모든 창 최소화에 휩쓸리면 안 된다.
fn pin_to_desktop(window: &tauri::WebviewWindow) {
    let _ = window.set_always_on_bottom(true);
    // Windows 에서 이 설정은 WS_EX_TOOLWINDOW 를 붙여 Alt+Tab 목록에서도 빼준다
    let _ = window.set_skip_taskbar(true);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 창 위치와 크기를 종료 시 기억한다
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // 로그인 때 시스템 기본 브라우저를 여는 데 쓴다
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![oauth::wait_for_oauth_code])
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main 창이 설정에 없습니다");

            pin_to_desktop(&window);

            // 반투명 + 흐림. 배경화면이 비치되 글자는 읽히도록 어둡게 깐다.
            #[cfg(target_os = "windows")]
            {
                if apply_acrylic(&window, Some((14, 15, 19, 190))).is_err() {
                    // Acrylic 을 못 쓰는 환경이면 불투명 창으로 계속 간다
                    let _ = window.set_decorations(false);
                }
            }

            // 개발 중에 실행 파일이 시작프로그램에 등록되면 곤란하므로 릴리스에서만 켠다
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let manager = app.autolaunch();
                if !manager.is_enabled().unwrap_or(false) {
                    let _ = manager.enable();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("TDLST 실행 실패");
}
