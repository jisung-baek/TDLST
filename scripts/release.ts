/**
 * 고친 것을 폰과 노트북 위젯에 한 번에 반영한다.
 *
 *   npm run release              push(→ 폰) + 위젯 빌드·재설치·재실행
 *   npm run release -- --no-push 위젯만
 *
 * 폰: main 을 push 하면 GitHub Actions(.github/workflows/deploy-pages.yml)가
 *     tdlst.pages.dev 로 올린다. 여기서는 push 만 한다.
 * 위젯: 화면 파일이 exe 안에 들어 있어서 다시 빌드해 설치해야 바뀐다.
 *     실행 중인 위젯을 끄고 설치 파일을 조용히(/S) 돌린 뒤 다시 띄운다.
 *     NSIS 가 currentUser 모드라 관리자 권한이 필요 없다.
 */
import { execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const noPush = process.argv.includes('--no-push')

const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const INSTALLER = join(
  ROOT,
  'src-tauri/target/release/bundle/nsis',
  `${conf.productName}_${conf.version}_x64-setup.exe`,
)
// installMode: currentUser 의 기본 설치 위치
const INSTALLED = join(process.env.LOCALAPPDATA ?? '', conf.productName, 'tdlst.exe')

const git = (args: string) => execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim()
const step = (msg: string) => console.log(`\n▶ ${msg}`)

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.error(`\n✖ ${cmd} ${args.join(' ')} 실패 (종료 코드 ${r.status})`)
    process.exit(r.status ?? 1)
  }
}

// ── 폰 ──────────────────────────────────────────────────
// 위젯은 지금 폴더의 파일로 빌드하지만 폰은 커밋된 것만 받는다. 둘이 어긋나면 알린다.
if (git('status --porcelain')) {
  console.warn(
    '⚠ 커밋하지 않은 변경이 있습니다. 위젯에는 들어가지만 폰에는 커밋·push 해야 들어갑니다.',
  )
}

if (noPush) {
  step('폰: 건너뜀 (--no-push)')
} else {
  step('폰: GitHub 에 push')
  let ahead = 0
  try {
    ahead = Number(git('rev-list --count @{u}..HEAD'))
  } catch {
    console.warn('  upstream 이 없어 push 하지 않습니다.')
  }
  if (ahead > 0) {
    run('git', ['push'])
    console.log('  → GitHub Actions 가 tdlst.pages.dev 로 올립니다 (1~2분). 진행: gh run watch')
  } else {
    console.log('  보낼 커밋이 없습니다.')
  }
}

// ── 위젯 ────────────────────────────────────────────────
step('위젯: 빌드 (tauri build — 몇 분 걸립니다)')
const startedAt = Date.now()
run('npm', ['run', 'widget:build'])

// 빌드가 실패했는데 예전 설치 파일이 남아 있으면 옛 버전을 다시 깔게 된다
if (!existsSync(INSTALLER) || statSync(INSTALLER).mtimeMs < startedAt) {
  console.error(`\n✖ 새 설치 파일을 찾지 못했습니다: ${INSTALLER}`)
  process.exit(1)
}

step('위젯: 실행 중인 위젯 끄기')
// 켜져 있으면 설치 파일이 tdlst.exe 를 덮어쓰지 못한다. 꺼져 있으면 오류가 나는데 무시한다.
spawnSync('taskkill', ['/IM', 'tdlst.exe', '/F'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 1000))

step('위젯: 설치')
run(`"${INSTALLER}"`, ['/S'])

step('위젯: 다시 켜기')
if (!existsSync(INSTALLED)) {
  console.error(`\n✖ 설치 위치에서 실행 파일을 찾지 못했습니다: ${INSTALLED}`)
  process.exit(1)
}
spawn(INSTALLED, [], { detached: true, stdio: 'ignore' }).unref()

console.log('\n✔ 끝났습니다.')
