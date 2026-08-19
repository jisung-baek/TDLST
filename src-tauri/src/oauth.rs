//! 데스크톱 로그인 콜백 수신.
//!
//! 구글은 앱에 내장된 웹뷰에서의 OAuth 를 거부한다. 그래서 위젯 안에서 로그인
//! 창을 띄우지 않고 시스템 기본 브라우저로 내보낸 뒤, 여기서 루프백 주소로
//! 돌아오는 인증 코드를 받는다 (RFC 8252 의 loopback interface redirection).

use std::io::{BufRead, BufReader, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::time::Duration;

/// Supabase 의 Redirect URLs 에 `http://localhost:14237` 로 등록해 둔 포트.
const PORT: u16 = 14237;

/// 브라우저를 열어둔 채 사용자가 로그인을 끝내기를 기다리는 시간
const TIMEOUT: Duration = Duration::from_secs(300);

const DONE_PAGE: &str = r#"<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>TDLST</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#0e0f13;color:#e8eaf0;
       font-family:system-ui,'Malgun Gothic',sans-serif;text-align:center}
  p{color:#9aa0b0;font-size:14px;margin:8px 0 0}
</style></head>
<body><div><strong>로그인되었습니다</strong><p>이 창을 닫고 위젯으로 돌아가세요.</p></div></body></html>"#;

const FAIL_PAGE: &str = r#"<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>TDLST</title>
<style>
  html,body{height:100%;margin:0}
  body{display:grid;place-items:center;background:#0e0f13;color:#ff6b6b;
       font-family:system-ui,'Malgun Gothic',sans-serif;text-align:center}
  p{color:#9aa0b0;font-size:14px;margin:8px 0 0}
</style></head>
<body><div><strong>인증 코드를 받지 못했습니다</strong><p>위젯에서 다시 시도해 주세요.</p></div></body></html>"#;

fn respond(stream: &mut TcpStream, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.flush();
}

/// 쿼리 문자열의 퍼센트 인코딩을 푼다. `+` 는 공백으로 본다.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    Ok(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `GET /?code=abc&state=xyz HTTP/1.1` 형태의 첫 줄에서 원하는 값을 뽑는다.
fn param_from_request_line(line: &str, key: &str) -> Option<String> {
    let path = line.split_whitespace().nth(1)?;
    let query = path.split_once('?')?.1;
    query
        .split('&')
        .filter_map(|kv| kv.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| percent_decode(v))
}

/// 브라우저가 돌아올 때까지 기다렸다가 인증 코드를 돌려준다.
#[tauri::command]
pub async fn wait_for_oauth_code() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, PORT))
            .map_err(|e| format!("포트 {PORT} 를 열 수 없습니다: {e}"))?;

        let deadline = std::time::Instant::now() + TIMEOUT;
        // 시간 초과를 알아채려면 accept 가 영원히 막혀 있으면 안 된다
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("리스너 설정 실패: {e}"))?;

        loop {
            if std::time::Instant::now() > deadline {
                return Err("로그인 대기 시간이 지났습니다".to_string());
            }

            let (mut stream, _) = match listener.accept() {
                Ok(pair) => pair,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                    continue;
                }
                Err(e) => return Err(format!("연결을 받지 못했습니다: {e}")),
            };
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

            let mut line = String::new();
            if BufReader::new(&stream).read_line(&mut line).is_err() {
                continue;
            }

            if let Some(code) = param_from_request_line(&line, "code") {
                respond(&mut stream, DONE_PAGE);
                return Ok(code);
            }

            // 인증 실패로 돌아온 경우에는 사유를 그대로 올려보낸다
            if let Some(err) = param_from_request_line(&line, "error_description")
                .or_else(|| param_from_request_line(&line, "error"))
            {
                respond(&mut stream, FAIL_PAGE);
                return Err(err);
            }

            // favicon 요청 같은 잡음은 흘려보내고 계속 기다린다
            respond(&mut stream, FAIL_PAGE);
        }
    })
    .await
    .map_err(|e| format!("대기 작업이 중단되었습니다: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_code_from_request_line() {
        let line = "GET /?code=abc123&state=xyz HTTP/1.1";
        assert_eq!(param_from_request_line(line, "code").as_deref(), Some("abc123"));
        assert_eq!(param_from_request_line(line, "state").as_deref(), Some("xyz"));
        assert_eq!(param_from_request_line(line, "error"), None);
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("a%2Bb%20c"), "a+b c");
        assert_eq!(percent_decode("plain"), "plain");
        // 깨진 이스케이프는 그대로 둔다
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn ignores_request_without_query() {
        assert_eq!(param_from_request_line("GET /favicon.ico HTTP/1.1", "code"), None);
    }
}
