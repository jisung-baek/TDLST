# TDLST

노트북 바탕화면에 상주하는 할 일 위젯 + 아이폰에서 여는 웹앱. 둘이 같은 데이터를 실시간으로 본다.

설계 배경과 결정 사항은 [SPEC.md](./SPEC.md)에 있다.

```
PC 위젯 (Tauri v2)  ←→  Supabase (Postgres + Realtime)  ←→  iPhone PWA
```

---

# 처음 한 번만 하는 설정

전부 무료다. 순서대로 하면 15~20분 걸린다. A → G 순서를 지켜야 한다 (뒤 단계가 앞 단계에서 나온 값을 쓴다).

> 화면 이름이 안 보이면: Supabase와 Google Cloud는 메뉴 이름을 자주 바꾼다.
> 아래 이름으로 못 찾겠으면 각 대시보드 상단 검색창에 그 단어를 넣으면 나온다.

## A. Supabase 프로젝트 만들기

1. <https://supabase.com/dashboard> 접속 → GitHub 계정 등으로 로그인
2. 초록색 **New project** 버튼
3. 네 칸을 채운다

   | 칸 | 넣을 값 |
   |----|--------|
   | Organization | 처음이면 자동으로 만들어진 것 그대로 |
   | Name | `tdlst` (아무거나 좋다) |
   | Database Password | **Generate a password** 를 눌러 만들고, **어딘가에 복사해 둔다** |
   | Region | **Northeast Asia (Seoul)** |
   | Plan | Free |

   > DB 비밀번호는 이 앱이 쓰지 않는다. 다만 나중에 DB에 직접 붙을 일이 생기면 필요한데
   > 이 화면을 벗어나면 다시 볼 수 없으니 지금 복사해 두는 게 낫다.

4. **Create new project** → 1~2분 기다린다 (프로비저닝 중에는 메뉴가 회색이다)

## B. 표 만들기

1. 왼쪽 사이드바 **SQL Editor**
2. **New query** (또는 `+`)
3. 이 저장소의 [`supabase/schema.sql`](./supabase/schema.sql) 을 **전체 선택해서** 편집기에 붙여넣는다
4. 오른쪽 아래 **Run** (또는 `Ctrl+Enter`)
5. 아래에 `Success. No rows returned` 이 뜨면 성공이다

**제대로 됐는지 확인:** 같은 SQL Editor 에 아래를 붙여넣고 Run 한다.

```sql
select
  (select relrowsecurity from pg_class where oid = '''public.tasks'''::regclass) as rls_enabled,
  (select count(*) from pg_policies
     where schemaname = '''public''' and tablename = '''tasks''')                    as policy_count,
  (select count(*) from pg_publication_tables
     where pubname = '''supabase_realtime''' and tablename = '''tasks''')            as realtime;
```

`true` / `4` / `1` 이 나오면 된다. 표·보안 정책·Realtime 이 모두 켜졌다는 뜻이다.

화면으로 보고 싶으면 **Authentication → Policies** 에서 `tasks` 아래 정책 4개를 확인한다.
(Table Editor 사이드바의 자물쇠 아이콘은 대시보드 개편마다 위치가 바뀌니 기준으로 삼지 않는다.
RLS 가 꺼져 있으면 표를 열었을 때 위쪽에 빨간 `Unrestricted` 경고가 뜬다 — 그 경고가
안 보이는 것이 정상 신호다.)

이 한 번의 실행으로 표·색인·자동 갱신 트리거·보안 정책(RLS)·Realtime 이 전부 켜진다. 따로 만질 것 없다.

## C. Google 자격 증명 발급

1. <https://console.cloud.google.com> 접속
2. 상단 프로젝트 선택기 → **새 프로젝트** → 이름 `tdlst` → **만들기**
   → 만들어진 프로젝트로 **전환**한다 (상단 선택기에 `tdlst` 가 보여야 한다)
3. 왼쪽 메뉴 **API 및 서비스 → OAuth 동의 화면**
   (최근 개편돼 **Google 인증 플랫폼**이라는 이름으로 보일 수도 있다)
   - **시작하기** 를 누르고 채운다

     | 칸 | 넣을 값 |
     |----|--------|
     | 앱 이름 | `TDLST` |
     | 사용자 지원 이메일 | 본인 Gmail |
     | 대상(Audience) | **외부(External)** |
     | 연락처 이메일 | 본인 Gmail |

4. 왼쪽 **대상(Audience)** 화면에서 **앱 게시 → 프로덕션으로 푸시**

   > **이걸 꼭 하는 게 좋다.** 게시 상태가 '테스트'로 남아 있으면 구글이 주는 갱신 토큰이
   > **7일 뒤 만료**돼서 매주 다시 로그인해야 한다. 이 앱은 이메일·프로필 같은 민감하지
   > 않은 범위만 쓰기 때문에 심사 없이 즉시 게시된다.
   >
   > 게시가 내키지 않으면 대신 같은 화면의 **테스트 사용자**에 본인 Gmail 을 반드시
   > 추가해야 한다. 안 그러면 로그인 시 `access_denied` 가 난다. 대신 7일마다 재로그인.

5. 왼쪽 **클라이언트(Clients)** → **클라이언트 만들기**

   | 칸 | 넣을 값 |
   |----|--------|
   | 애플리케이션 유형 | **웹 애플리케이션** |
   | 이름 | `TDLST web` |
   | 승인된 JavaScript 원본 | 비워둔다 |
   | 승인된 리디렉션 URI | **URI 추가** 를 눌러 아래 한 줄만 |

   ```
   https://<프로젝트ref>.supabase.co/auth/v1/callback
   ```

   `<프로젝트ref>` 는 A 에서 만든 Supabase 프로젝트의 주소 앞부분이다.
   직접 조립하지 말고 **Supabase → Authentication → Sign In / Providers → Google** 을 열면
   `Callback URL (for OAuth)` 에 이 주소가 통째로 적혀 있으니 복사 버튼으로 가져오는 게 안전하다.

   > `http://localhost:14237` 은 **여기 넣지 않는다.** 구글은 Supabase 로만 돌려보내고,
   > 거기서 위젯으로 다시 돌려보내는 건 Supabase 몫이다. 그건 E 단계에서 등록한다.

6. **만들기** → 뜨는 창의 **클라이언트 ID** 와 **클라이언트 보안 비밀번호** 를 복사해 둔다
   (창을 닫아도 클라이언트 목록에서 다시 볼 수 있다)

## D. Supabase 에 Google 붙이기

1. Supabase → 왼쪽 **Authentication** → **Sign In / Providers**
2. 목록에서 **Google** 을 누른다
3. **Enable Sign in with Google** 토글을 켠다
4. C-6 에서 복사한 값을 붙여넣는다

   | 칸 | 값 |
   |----|-----|
   | Client IDs | 클라이언트 ID (`...apps.googleusercontent.com`) |
   | Client Secret | 클라이언트 보안 비밀번호 (`GOCSPX-...`) |

5. **Save**

## E. 돌아올 주소 등록

Supabase → **Authentication** → **URL Configuration**

- **Site URL** : `http://localhost:1420`
  (폰에 배포한 뒤에는 그 주소로 바꿔도 되고, 그대로 둬도 동작한다)
- **Redirect URLs** → **Add URL** 을 눌러 아래 세 개를 각각 추가

  | 용도 | 값 |
  |------|-----|
  | 브라우저에서 개발할 때 | `http://localhost:1420` |
  | **PC 위젯** | `http://localhost:14237` |
  | 폰 웹앱 | `https://tdlst.pages.dev` |

> **`14237` 을 빠뜨리면 PC 위젯에서만 로그인이 안 된다.** 브라우저에서는 멀쩡한데
> 위젯에서만 로그인 후 화면이 그대로인 증상으로 나타난다.
>
> 왜 이 포트가 필요한가: 구글은 앱 내장 웹뷰에서의 로그인을 정책적으로 막는다.
> 그래서 위젯은 시스템 기본 브라우저로 인증을 보내고, 자기는 `14237` 포트를 잠깐 열어
> 인증 결과를 받는다. 데스크톱 앱의 표준 방식(RFC 8252)이다. 이 포트는 로그인하는
> 몇 초 동안만 열리고 바로 닫힌다.

## F. `.env` 채우기

값을 가져올 곳: Supabase → 왼쪽 아래 **Project Settings**(톱니) → **API**
(새 대시보드에서는 **API Keys** 라는 별도 탭에 키가 있다)

| `.env` 항목 | 대시보드에서 복사할 것 |
|------------|---------------------|
| `VITE_SUPABASE_URL` | **Project URL** — `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | **anon / public** 키 — `eyJhbGciOi...` 로 시작하는 긴 문자열 |

프로젝트 루트의 `.env` 를 열어 자리표시자를 지우고 붙여넣는다.

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

- 따옴표를 붙이지 않는다. 한 줄에 하나씩, 줄바꿈이 끼지 않게 한다.
- 최근에 만든 프로젝트는 `anon` 자리에 `sb_publishable_...` 로 시작하는 **publishable** 키가
  보일 수 있다. 역할이 같으니 보이는 것을 그대로 쓰면 된다.
- **`service_role` / `secret` 키는 절대 넣지 않는다.** 그건 RLS 를 통째로 무시하는 키다.
- **개발 서버가 떠 있었다면 껐다 켜야 반영된다.** Vite 는 `.env` 를 시작할 때 한 번만 읽는다.

> anon key 는 공개돼도 되는 값이다. 데이터는 B 에서 켠 RLS 정책이 지킨다 —
> 로그인한 본인 행만 읽고 쓸 수 있다.

## G. 제대로 됐는지 확인

명령은 **Windows 기본 터미널(PowerShell)** 에서 실행한다. Win 키 → `터미널` 로 열고
프로젝트 폴더로 이동한 뒤 친다. VS Code 로 이 폴더를 열었다면 <kbd>Ctrl</kbd>+<kbd>`</kbd> 로
뜨는 터미널이 이미 이 폴더라서 `cd` 가 필요 없다.

> 이 문서의 코드 블록에 붙은 `bash` 는 문법 강조용 이름일 뿐이다.
> Git Bash 를 따로 설치하거나 쓸 필요 없다.

```bash
cd C:\Users\jisungb\Desktop\SNU\etc\TDLST
npm install        # 처음 한 번만. node_modules 가 이미 있으면 건너뛰어도 된다
npm run dev
```

`npm run dev` 는 끝나지 않고 계속 떠 있는 게 정상이다. `Local: http://localhost:1420/` 이
찍히면 준비된 것이다. 멈추려면 `Ctrl+C`. 이 터미널은 계속 점유되므로 다른 명령을 쓰려면
`Ctrl+Shift+T` 로 탭을 하나 더 열어 같은 폴더에서 실행한다.

1. <http://localhost:1420> 을 열면 로그인 화면이 나온다
2. **Google 로 계속하기** → 계정 선택 → 목록 화면으로 돌아온다
3. 화면 하단에 **동기화됨** 이 뜬다 (계속 `연결 중…` 이면 아래 문제 해결로)
4. 아무 task 나 하나 추가한다
5. Supabase → **Table Editor** → `tasks` 에 그 행이 보이면 **설정 끝이다**

여기까지 됐으면 위젯을 띄운다.

```bash
npm run widget
```

## 문제 해결

| 증상 | 원인과 조치 |
|------|-----------|
| 구글 화면에 `redirect_uri_mismatch` | C-5 의 승인된 리디렉션 URI 가 Supabase 콜백 주소와 한 글자라도 다르다. Supabase 화면의 복사 버튼으로 다시 가져온다 |
| 구글이 `access_denied` / "확인되지 않은 앱" | C-4 를 안 했다. 앱을 게시하거나 테스트 사용자에 본인 Gmail 을 추가한다 |
| **위젯**에서만 로그인 후 화면이 그대로 | E 의 `http://localhost:14237` 이 빠졌다 |
| 브라우저에서 로그인 후 화면이 그대로 | E 의 `http://localhost:1420` 이 빠졌다 |
| `Invalid API key` | F 의 anon key 오타 또는 줄바꿈. 통째로 다시 복사한다 |
| `.env` 를 고쳤는데 그대로 | 개발 서버를 껐다 켠다 |
| `relation "public.tasks" does not exist` | B 를 안 했거나 실행이 실패했다. SQL Editor 에서 다시 Run |
| 하단이 계속 `연결 중…` | `.env` 값이 자리표시자 그대로이거나 네트워크가 막혔다 |
| PC 와 폰이 서로 안 보임 | 다른 구글 계정으로 로그인했을 가능성이 크다. 데이터는 계정별로 완전히 분리된다 |
| 폰에서만 로그인 실패 | 배포 주소를 E 의 Redirect URLs 에 추가하지 않았다 |

---

# 실행

```bash
npm install
npm run dev        # 브라우저에서 확인  http://localhost:1420
npm run widget     # PC 위젯을 개발 모드로 띄운다
npm test           # 날짜 파서 · 반복 · 그룹핑 검증 (44개)
npm run shoot      # 데모 화면을 shots/ 에 그림으로 저장
```

## Supabase 설정 없이 화면 먼저 보기

`npm run dev` 를 띄운 뒤 <http://localhost:1420/demo.html> 을 열면 목 데이터로 채워진
위젯 화면이 그대로 나온다. 로그인도 서버도 필요 없다. UI 를 손볼 때 이쪽을 보면 된다.

`npm run shoot` 은 그 화면을 위젯 크기 · 넓은 창 · 폰 세 가지로 찍어 `shots/` 에 남긴다.
(`npm run dev` 가 떠 있어야 한다.)

# 위젯 설치본 만들기

`.env` 를 먼저 채워야 한다. Vite 는 빌드 시점에 환경 변수를 번들에 박아 넣기 때문에,
자리표시자인 채로 빌드하면 서버에 붙지 못하는 설치본이 나온다.

```bash
npm run widget:build
```

`src-tauri/target/release/bundle/nsis/` 에 설치 파일이 생긴다.
설치하면 다음 부팅부터 자동 실행된다. (개발 모드에서는 자동 실행에 등록되지 않는다.)

## 위젯 창의 성질

- **바탕화면 층에 고정** — 다른 창을 열면 가려진다. `Win+D` 로 창을 치우면 드러난다.
- 최소화가 막혀 있어 `Win+M` 에 휩쓸리지 않는다.
- 작업표시줄에는 나오지 않는다. 다만 `Alt+Tab` 목록에는 아직 뜬다 —
  `set_skip_taskbar` 가 `WS_EX_TOOLWINDOW` 까지 붙여주지는 않았다. 거슬리면 고칠 수 있다.
- 창 위·아래 26px 띠를 끌면 위치를 옮길 수 있고, 위치와 크기는 종료 시 기억된다.
- 배경은 반투명 Acrylic. 배경화면이 비친다.
- **끄는 법**: 하단 상태 표시줄 오른쪽 끝, 로그아웃 옆의 **끄기** 버튼.
  창 장식이 없어 이것 말고는 종료 수단이 없다 (로그인 화면에도 같은 버튼이 있다).

# 폰에 올리기

**배포된 주소: <https://tdlst.pages.dev>** (Cloudflare Pages, 프로젝트명 `tdlst`)

## 1. 직접 업로드 (지금 쓰는 방식)

이 프로젝트는 git 저장소가 아니므로 GitHub 없이 올리는 쪽이 빠르다.
화면을 고친 뒤 갱신하려면 이 두 줄이면 된다.

```bash
npm run build
npx wrangler pages deploy dist --project-name tdlst --branch main
```

처음 한 번은 준비가 더 필요했다 (이미 끝난 단계다).

```bash
npx wrangler login                                        # 브라우저 인증
npx wrangler pages project create tdlst --production-branch main
```

> Cloudflare 계정을 새로 만들었다면 **메일함의 인증 링크를 먼저 눌러야** 한다.
> 안 그러면 프로젝트 생성이 `Your user email must be verified [code: 8000077]` 로 막힌다.

> Cloudflare 에 환경 변수를 등록할 필요가 없다. `npm run build` 가 `.env` 값을 이미
> 번들에 넣은 채로 올라가기 때문이다. 뒤집어 말하면 **`.env` 를 고쳤을 때는 반드시
> 다시 빌드해서 다시 올려야** 반영된다.

## 2. GitHub 연결 (자동 배포가 필요하면)

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages**
2. 이 폴더를 GitHub 저장소로 올린 뒤 **Connect to Git** 으로 연결한다
3. 빌드 설정

   | 칸 | 값 |
   |----|-----|
   | Framework preset | None (또는 Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

4. **Environment variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 등록한다
   (`.env` 는 `.gitignore` 에 걸려 저장소에 올라가지 않으므로 여기에 따로 넣어야 한다)
5. **Save and Deploy**

## 배포한 뒤 (두 방식 공통)

1. 받은 주소를 **Supabase → Authentication → URL Configuration → Redirect URLs** 에
   추가한다 (E 단계). **이걸 빠뜨리면 폰에서만 로그인이 안 된다.**
2. 아이폰 **사파리**로 그 주소를 연다 (크롬이 아니라 사파리여야 한다)
3. 하단 **공유** → **홈 화면에 추가** → 앱처럼 전체화면으로 뜬다

---

# 쓰는 법

## 입력

입력창에 한 줄로 적으면 날짜를 알아서 떼어낸다.

| 입력 | 결과 |
|------|------|
| `과제 제출 8/19` | 8월 19일, 종일 |
| `스터디 8/19 15:00` | 8월 19일 15:00 |
| `회의 8-19 3pm` | 8월 19일 15:00 |
| `리허설 8/19 14시 30분` | 8월 19일 14:30 |
| `정산 19일` | 이번 달 19일 (지났으면 다음 달) |
| `미팅 15:00` | 오늘 15:00 (지난 시각이면 내일) |
| `책 반납` | 날짜 없음 → '언젠가' |

연도를 생략하면 올해로 보되, 이미 지난 날짜면 내년으로 넘긴다. 단 일주일 이내의 과거는
지연된 일을 뒤늦게 적는 경우로 보고 그대로 둔다.

잘못 인식하면 입력창 아래 미리보기의 `✕` 를 눌러 해제한다.

## 단축키

| 키 | 동작 |
|----|------|
| `Enter` | 추가 |
| `Tab` | 학업 ↔ 기타 전환 |
| `Esc` | 입력창 비우기 / 날짜 선택 해제 / 상세 패널 닫기 |

## 그 밖에

- 달력 날짜를 누르면 그날 것만 보고, 다시 누르면 전체로 돌아온다.
- 날짜를 고른 상태에서 적으면 날짜를 안 써도 그날로 들어간다.
- task 를 누르면 상세 패널이 열린다. 메모는 마크다운으로 쓴다.
- 반복은 상세 패널의 드롭다운에서 정한다. 반복 항목은 완료해도 목록에서 사라지지 않고
  다음 주기로 넘어간다.
- 완료한 항목은 하단의 접힌 섹션에 취소선이 그어진 채로 남는다. 30일이 지나면 읽지 않는다.
- 오프라인에서도 추가·수정·완료가 된다. 하단에 대기 개수가 뜨고, 연결되면 알아서 올라간다.

---

# 구조

```
src/
  lib/
    dateParser.ts   입력 한 줄에서 마감일 뽑기 (외부 의존성 없음)
    repeat.ts       다음 주기 계산
    grouping.ts     사이드 리스트 그룹 · 달력 표식
    store.ts        낙관적 갱신 + 오프라인 큐 + Realtime 구독
    db.ts           IndexedDB 캐시와 변경 큐
    supabase.ts     클라이언트
  components/       Calendar · TaskInput · TaskList · DetailPanel · Login
src-tauri/          바탕화면 고정, Acrylic, 자동 실행, 창 상태 기억
  src/oauth.rs      로그인 콜백을 받는 14237 포트 리스너
supabase/schema.sql 테이블 · RLS · Realtime
scripts/            테스트 · 아이콘 생성 · 화면 캡처
```

프론트엔드 코드는 PC와 폰이 같은 것을 쓴다. 레이아웃만 `@media (max-width: 720px)` 로 갈린다.
