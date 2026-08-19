import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Calendar from './components/Calendar.tsx'
import DetailPanel from './components/DetailPanel.tsx'
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!authReady) return null
  if (!session) return <Login />
  return <Widget userId={session.user.id} />
}

export function Widget({ userId }: { userId: string }) {
  const { tasks, online, pending, synced, error, loading } = useStore()
  const [now, setNow] = useState(() => new Date())
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [calCollapsed, setCalCollapsed] = useState(false)

  useEffect(() => {
    void taskStore.init(userId)
    return () => taskStore.dispose()
  }, [userId])

  // 자정을 넘기면 '오늘' 그룹이 바뀌어야 한다
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // 달력에서 날짜를 고른 상태는 Esc 로 푼다
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !openTaskId && selectedDate) setSelectedDate(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openTaskId, selectedDate])

  const groups: TaskGroup[] = useMemo(() => {
    if (!selectedDate) return groupTasks(tasks, now)
    const { open, done } = tasksForDate(tasks, selectedDate)
    const out: TaskGroup[] = []
    if (open.length) out.push({ key: 'today', label: '할 일', tasks: open, collapsed: false })
    if (done.length) out.push({ key: 'done', label: '완료됨', tasks: done, collapsed: true })
    return out
  }, [tasks, now, selectedDate])

  const openTask: Task | null = openTaskId
    ? (tasks.find((t) => t.id === openTaskId) ?? null)
    : null

  function handleAdd(input: NewTask) {
    void taskStore.add(input)
  }

  function handleToggle(id: string) {
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    void (t.completed_at ? taskStore.uncomplete(id) : taskStore.complete(id))
  }

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
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
        tasks={tasks}
        selected={selectedDate}
        now={now}
        collapsed={calCollapsed}
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
            />
          )}
        </div>

        <div className={'status' + (online ? '' : ' offline')}>
          <span className="dot" />
          {error ? (
            <span className="err" title={error}>
              {error}
            </span>
          ) : !online ? (
            <span>오프라인{pending > 0 ? ` · 대기 ${pending}` : ''}</span>
          ) : pending > 0 ? (
            <span>보내는 중 {pending}</span>
          ) : synced ? (
            <span>동기화됨</span>
          ) : (
            <span>연결 중…</span>
          )}
          <button
            onClick={() => {
              void taskStore.reset().then(() => supabase.auth.signOut())
            }}
          >
            로그아웃
          </button>
          {IN_TAURI && (
            <button
              style={{ marginLeft: 8 }}
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
          onDelete={() => {
            void taskStore.remove(openTask.id)
            setOpenTaskId(null)
          }}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  )
}
