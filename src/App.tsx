import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Session } from '@supabase/supabase-js'
import Calendar from './components/Calendar.tsx'
import DetailPanel, { preloadMarkdown } from './components/DetailPanel.tsx'
import Login from './components/Login.tsx'
import TaskList from './components/TaskList.tsx'
import TaskInput from './components/TaskInput.tsx'
import { groupTasks, tasksForDate, type TaskGroup } from './lib/grouping.ts'
import { supabase } from './lib/supabase.ts'
import type { NewTask, Task } from './lib/types.ts'
import { taskStore, useStore } from './lib/useStore.ts'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** Tauri 창에서만 상단 드래그 띠를 붙인다 */
const IN_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** 미루기·삭제를 되돌릴 수 있는 시간. 이 뒤에는 안내줄이 스스로 사라진다. */
const UNDO_MS = 8_000

/** 폰 레이아웃 분기점. global.css 의 @media (max-width: 720px) 와 같아야 한다. */
const PHONE = '(max-width: 720px)'
function useIsPhone(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(PHONE).matches,
  )
}

/**
 * 상태줄에는 글을 두지 않는다. 점 하나(채움 = 정상, 테두리 = 오프라인·실패)가 전부고,
 * 자세한 내용은 마우스를 올리거나 스크린리더로 읽을 때만 나온다.
 * 서버 원문 오류("invalid input syntax for type uuid…")는 사람이 읽을 말이 아니라 뒤에 붙인다.
 */
function syncLabel(s: { error: string | null; online: boolean; pending: number; synced: boolean }) {
  if (s.error) {
    const head = /jwt|token|auth|401|403/i.test(s.error)
      ? '로그인이 만료됐습니다'
      : '동기화하지 못했습니다 — 변경은 이 기기에 저장돼 있습니다'
    return `${head}\n(${s.error})`
  }
  if (!s.online) return '오프라인' + (s.pending > 0 ? ` — 보낼 변경 ${s.pending}개` : '')
  if (s.pending > 0) return `보내는 중 (${s.pending})`
  return s.synced ? '동기화됨' : '연결 중…'
}

/** 되돌리기 줄 하나가 미루기와 삭제를 같이 맡는다 */
type Undo =
  | { kind: 'postpone'; entries: { id: string; due_at: string }[] }
  | { kind: 'delete'; id: string; title: string }

/**
 * 초기화 중이거나 초기화에 실패했을 때 대신 그리는 표면.
 *
 * 창이 투명하기 때문에 아무것도 렌더하지 않으면 빈 창이 배경화면과 구분되지
 * 않는다. 그러면 앱이 뜬 건지 죽은 건지조차 알 수 없다. 무슨 일이 있어도
 * 표면은 깔고, 이유를 글로 적는다.
 */
function Boot({ message }: { message: string }) {
  return (
    <div className="login">
      <div>
        <h1>TDLST</h1>
        <p className="hint">{message}</p>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    // catch 가 없으면 세션 조회가 실패했을 때 authReady 가 영영 false 로 남는다
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e) => setBootError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAuthReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) return <Boot message="시작하는 중…" />
  if (bootError) return <Boot message={`세션을 읽지 못했습니다 — ${bootError}`} />
  if (!session) return <Login />
  return <Widget userId={session.user.id} email={session.user.email ?? null} />
}

export function Widget({ userId, email }: { userId: string; email?: string | null }) {
  const { tasks, online, pending, synced, error, loading } = useStore()
  const [now, setNow] = useState(() => new Date())
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const isPhone = useIsPhone()
  // 폰에서는 달력이 화면 절반을 먹어 목록이 서너 줄만 보인다. 기본은 한 주만.
  const [calCollapsed, setCalCollapsed] = useState(true)
  const [undo, setUndo] = useState<Undo | null>(null)
  const undoRef = useRef<Undo | null>(null)
  undoRef.current = undo
  // null 이면 아직 못 읽었거나 Tauri 밖이다 — 그동안은 토글을 숨긴다
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    void taskStore.init(userId)
    return () => taskStore.dispose()
  }, [userId])

  // 시작프로그램 등록 여부는 레지스트리가 정답이므로 켤 때마다 읽어온다
  useEffect(() => {
    if (!IN_TAURI) return
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<boolean>('autostart_enabled'))
      .then(setAutostart)
      .catch(() => setAutostart(false))
  }, [])

  // 자정을 넘기면 '오늘' 그룹이 바뀌어야 한다
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  /*
   * 삭제는 곧바로 서버로 보내지 않고 되돌리기 시간이 지난 뒤에 확정한다.
   * 그동안은 화면에서만 숨긴다. 그 사이 창이 닫히면 지워지지 않은 채 남는데,
   * 반대(되돌릴 수 없는 삭제)보다 나은 쪽으로 틀리는 것이다.
   */
  function commit(u: Undo | null) {
    if (u?.kind === 'delete') void taskStore.remove(u.id)
  }
  function startUndo(next: Undo) {
    commit(undoRef.current) // 앞의 삭제가 아직 대기 중이면 먼저 확정한다
    setUndo(next)
  }

  // 되돌리기 안내는 잠깐만 머문다. 계속 두면 목록을 가리는 줄만 남는다.
  useEffect(() => {
    if (!undo) return
    const id = setTimeout(() => {
      commit(undo)
      setUndo(null)
    }, UNDO_MS)
    return () => clearTimeout(id)
  }, [undo])

  useEffect(() => {
    const flush = () => commit(undoRef.current)
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  // 마크다운 렌더러는 지연 로드다. 한가할 때 미리 받아 둔다.
  useEffect(() => {
    const ric = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    ric(preloadMarkdown)
  }, [])

  const visibleTasks = useMemo(
    () => (undo?.kind === 'delete' ? tasks.filter((t) => t.id !== undo.id) : tasks),
    [tasks, undo],
  )

  // 달력에서 날짜를 고른 상태는 Esc 로 푼다
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !openTaskId && selectedDate) setSelectedDate(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTaskId, selectedDate])

  const groups: TaskGroup[] = useMemo(() => {
    if (!selectedDate) return groupTasks(visibleTasks, now)
    const { open, done } = tasksForDate(visibleTasks, selectedDate)
    const out: TaskGroup[] = []
    if (open.length) out.push({ key: 'today', label: '할 일', tasks: open, collapsed: false })
    if (done.length) out.push({ key: 'done', label: '완료됨', tasks: done, collapsed: true })
    return out
  }, [visibleTasks, now, selectedDate])

  const openTask: Task | null = openTaskId
    ? (tasks.find((t) => t.id === openTaskId) ?? null)
    : null

  function handleAdd(input: NewTask) {
    void taskStore.add(input)
  }

  function handleDelete(id: string) {
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    startUndo({ kind: 'delete', id, title: t.title })
    // 지운 항목의 상세가 열려 있었다면 같이 닫는다
    if (openTaskId === id) setOpenTaskId(null)
  }

  /**
   * 미루기 (SPEC §3) — 지연 그룹을 통째로 오늘로 옮긴다.
   * 확인 창은 두지 않고(삭제와 같은 규칙) 대신 잠시 되돌릴 수 있게 한다.
   */
  function handlePostpone(overdue: Task[]) {
    const today = new Date()
    // 자정을 막 넘긴 순간이면 now 가 아직 어제다. 옮길 날짜와 그룹 기준을 함께 맞춘다.
    setNow(today)
    void taskStore.postpone(
      overdue.map((t) => t.id),
      today,
    ).then((before) => {
      if (before.length > 0) startUndo({ kind: 'postpone', entries: before })
    })
  }

  function handleUndo() {
    const u = undo
    setUndo(null)
    if (u?.kind === 'postpone') void taskStore.restoreDue(u.entries)
    // 삭제는 아직 보내지 않았으므로 숨김만 풀면 된다
  }

  function handleToggle(id: string) {
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    void (t.completed_at ? taskStore.uncomplete(id) : taskStore.complete(id))
  }

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  function toggleAutostart() {
    const next = !autostart
    setAutostart(next)
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_autostart', { enabled: next }))
      .catch(() => setAutostart(!next)) // 실패하면 표시를 되돌린다
  }

  function goToday() {
    const d = new Date()
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelectedDate(null)
  }

  return (
    <div className="app">
      {IN_TAURI && <div className="drag-strip" data-tauri-drag-region />}

      <Calendar
        month={month}
        tasks={visibleTasks}
        selected={selectedDate}
        now={now}
        collapsed={isPhone && calCollapsed}
        onMonthShift={shiftMonth}
        onToday={goToday}
        onSelect={(d) => {
          setSelectedDate(d)
          if (d && d.getMonth() !== month.getMonth()) {
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
          }
        }}
        onToggleCollapsed={() => setCalCollapsed((c) => !c)}
      />

      <div className="side">
        <div className="side-head">
          <TaskInput defaultDate={selectedDate} onAdd={handleAdd} />
        </div>

        {selectedDate && (
          <div className="side-context">
            <span>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 (
              {WEEKDAY[selectedDate.getDay()]})
            </span>
            <button onClick={() => setSelectedDate(null)}>전체 보기</button>
          </div>
        )}

        {undo && (
          <div className="undo-bar" role="status">
            <span>
              {undo.kind === 'postpone'
                ? `${undo.entries.length}개를 오늘로 미뤘습니다`
                : `삭제했습니다 · ${undo.title}`}
            </span>
            <button onClick={handleUndo}>되돌리기</button>
          </div>
        )}

        <div className="side-scroll">
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <TaskList
              groups={groups}
              selectedId={openTaskId}
              now={now}
              onToggle={handleToggle}
              onOpen={setOpenTaskId}
              onDelete={handleDelete}
              onPostpone={handlePostpone}
            />
          )}
        </div>

        <div className={'status' + (error ? ' failed' : online ? '' : ' offline')}>
          <span
            className="dot"
            role="status"
            title={syncLabel({ error, online, pending, synced })}
            aria-label={syncLabel({ error, online, pending, synced })}
          />
          {autostart !== null && (
            <button
              aria-pressed={autostart}
              title={
                autostart
                  ? '컴퓨터를 켤 때 같이 실행됩니다 — 눌러서 끄기'
                  : '컴퓨터를 켤 때 같이 실행하기'
              }
              onClick={toggleAutostart}
            >
              자동 실행 {autostart ? '켜짐' : '꺼짐'}
            </button>
          )}
          <button
            // 어느 계정인지는 목록이 비어 보일 때 가장 먼저 볼 곳이라, 글 대신 여기 둔다
            title={email ? `로그인 계정 — ${email}` : undefined}
            onClick={() => {
              void taskStore.reset().then(() => supabase.auth.signOut())
            }}
          >
            로그아웃
          </button>
          {IN_TAURI && (
            <button
              title="위젯 끄기"
              onClick={() => {
                void import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
                  getCurrentWindow().close(),
                )
              }}
            >
              끄기
            </button>
          )}
        </div>
      </div>

      {openTask && (
        <DetailPanel
          task={openTask}
          onPatch={(patch) => void taskStore.update(openTask.id, patch)}
          onDelete={() => handleDelete(openTask.id)}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  )
}
