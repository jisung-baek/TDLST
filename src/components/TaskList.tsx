import { useEffect, useRef, useState } from 'react'
import type { GroupKey, TaskGroup } from '../lib/grouping.ts'
import { startOfDay } from '../lib/grouping.ts'
import { CATEGORY_COLOR, type Task } from '../lib/types.ts'
import { Chevron, NoteIcon, RepeatIcon } from './Icons.tsx'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function timeLabel(t: Task): string | null {
  if (!t.due_at || t.is_all_day) return null
  const d = new Date(t.due_at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dateLabel(t: Task, now: Date): string | null {
  if (!t.due_at) return null
  const d = new Date(t.due_at)
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86_400_000)
  if (diff === 0) return null
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
  }
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`
}

/*
 * 길게 누르기 = 우클릭. 터치에서는 contextmenu 를 믿지 않고 직접 잰다.
 * iOS Safari 는 링크나 이미지가 아닌 요소에서 이 이벤트를 흘려보내는 일이 있다.
 * 손가락이 이만큼 넘게 움직이면 누른 게 아니라 스크롤로 본다.
 */
const LONG_PRESS_MS = 450
const LONG_PRESS_SLOP = 10

interface ItemProps {
  task: Task
  selected: boolean
  now: Date
  showDate: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onMenu: (id: string, x: number, y: number) => void
}

function TaskItem({ task, selected, now, showDate, onToggle, onOpen, onMenu }: ItemProps) {
  const done = !!task.completed_at
  const overdue =
    !done && !!task.due_at && new Date(task.due_at).getTime() < startOfDay(now).getTime()
  const time = timeLabel(task)
  const date = showDate ? dateLabel(task, now) : null

  const timer = useRef<number | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const opened = useRef(false)

  function cancelPress() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    origin.current = null
  }

  // 화면을 벗어나며 타이머만 남으면 지워진 항목의 메뉴가 뒤늦게 뜬다
  useEffect(() => cancelPress, [])

  function startPress(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    const { clientX: x, clientY: y } = touch
    opened.current = false
    origin.current = { x, y }
    timer.current = window.setTimeout(() => {
      timer.current = null
      opened.current = true
      onMenu(task.id, x, y)
    }, LONG_PRESS_MS)
  }

  function movePress(e: React.TouchEvent) {
    const touch = e.touches[0]
    const from = origin.current
    if (!touch || !from) return
    const moved =
      Math.abs(touch.clientX - from.x) > LONG_PRESS_SLOP ||
      Math.abs(touch.clientY - from.y) > LONG_PRESS_SLOP
    if (moved) cancelPress()
  }

  /** 길게 눌러 메뉴를 띄우면 손을 뗄 때 click 이 따라온다. 그 한 번을 삼킨다. */
  function swallowClick() {
    if (!opened.current) return false
    opened.current = false
    return true
  }

  return (
    <div
      className={'task' + (done ? ' done' : '') + (selected ? ' selected' : '')}
      // div 라 그대로는 키보드로 닿지 않는다. 줄 자체가 '상세 열기' 버튼이다.
      role="button"
      tabIndex={0}
      aria-label={`${task.title} — 상세 열기`}
      onClick={() => {
        if (swallowClick()) return
        onOpen(task.id)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(task.id)
        } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          onMenu(task.id, r.left + 40, r.bottom - 4)
        }
      }}
      onContextMenu={(e) => {
        // 위젯 안에서는 브라우저 기본 메뉴가 쓸모없다 — 우리 메뉴로 대체한다
        e.preventDefault()
        onMenu(task.id, e.clientX, e.clientY)
      }}
      onTouchStart={startPress}
      onTouchMove={movePress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
    >
      <button
        className={'task-check' + (done ? ' done' : '')}
        onClick={(e) => {
          e.stopPropagation()
          // 동그라미를 길게 눌러도 메뉴가 뜬다. 그때는 완료 처리하지 않는다.
          if (swallowClick()) return
          onToggle(task.id)
        }}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `${task.title} 완료 취소` : `${task.title} 완료`}
        title={done ? '완료 취소' : '완료'}
      />
      <span className="task-bar" style={{ background: CATEGORY_COLOR[task.category] }} />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {(date || time || task.repeat !== 'none' || task.notes) && (
          <div className="task-meta">
            {date && <span className={overdue ? 'overdue' : undefined}>{date}</span>}
            {time && <span className={overdue ? 'overdue' : undefined}>{time}</span>}
            {task.repeat !== 'none' && (
              <span title="반복" aria-label="반복">
                <RepeatIcon className="meta-icon" />
              </span>
            )}
            {task.notes && (
              <span className="task-note-mark" title="메모 있음" aria-label="메모 있음">
                <NoteIcon className="meta-icon" />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  groups: TaskGroup[]
  selectedId: string | null
  now: Date
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /** 지연 그룹을 통째로 오늘로 옮긴다 */
  onPostpone: (tasks: Task[]) => void
}

/** 우클릭한 항목과 메뉴를 띄울 화면 좌표 */
interface Menu {
  id: string
  x: number
  y: number
}

/** 한 줄짜리 메뉴라 크기가 고정이다. 화면 밖으로 나가지 않게 이 값으로 접어 넣는다. */
const MENU_W = 132
const MENU_H = 44

export default function TaskList({
  groups,
  selectedId,
  now,
  onToggle,
  onOpen,
  onDelete,
  onPostpone,
}: Props) {
  // 접힘 상태는 그룹이 사라졌다 나타나도 유지되도록 key 로 들고 있는다
  const [collapsed, setCollapsed] = useState<Partial<Record<GroupKey, boolean>>>({
    later: true,
    done: true,
  })
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuItem = useRef<HTMLButtonElement>(null)

  // 메뉴가 뜨면 항목에 포커스를 준다 — 키보드로 연 경우 Enter 한 번이면 끝난다
  useEffect(() => {
    if (menu) menuItem.current?.focus({ preventScroll: true })
  }, [menu])

  /*
   * 메뉴는 아무 데나 손대면 닫힌다.
   *
   * mousedown 이 아니라 pointerdown 으로 받는다. 터치에서는 손을 뗀 뒤에
   * 브라우저가 호환용 마우스 이벤트를 뒤늦게 한 번 더 쏘는데, mousedown 을
   * 듣고 있으면 길게 눌러 띄운 메뉴가 손을 떼는 순간 닫혀 버린다.
   * pointerdown 은 마우스든 손가락이든 누르는 시점에 한 번만 온다.
   *
   * 스크롤은 목록 안에서 나므로 캡처로 받는다.
   */
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // App 의 Esc(날짜 선택 해제)까지 같이 터지지 않게 여기서 끊는다
      e.stopPropagation()
      setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  if (groups.length === 0) {
    return (
      <div className="empty">
        할 일이 없습니다.
        <br />위 칸에 적어보세요.
      </div>
    )
  }

  return (
    <>
      {groups.map((g) => {
        const isCollapsed = collapsed[g.key] ?? g.collapsed
        const isOverdue = g.key === 'overdue'
        return (
          <div className="group" key={g.key}>
            {/* 헤더는 접기 버튼 하나로 끝났는데 '미루기'가 붙으면서 줄이 되었다.
                버튼 안에 버튼을 넣을 수 없어 둘을 나란히 둔다. */}
            <div className="group-head-row">
              <button
                className={'group-head' + (isOverdue ? ' overdue' : '')}
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
              >
                {/* 지남은 붉은색이 없는 대신 검은 정사각 마커가 캐럿을 대신한다.
                    접힘은 상태줄 점과 같은 규칙 — 채움 vs 테두리. */}
                {isOverdue ? (
                  <span className={'overdue-mark' + (isCollapsed ? ' closed' : '')} />
                ) : (
                  <Chevron dir="right" className={'caret' + (isCollapsed ? '' : ' open')} />
                )}
                {g.label}
                <span className="group-count">{g.tasks.length}</span>
              </button>
              {isOverdue && (
                <button
                  className="group-action"
                  title="지연된 항목을 모두 오늘로 옮깁니다"
                  onClick={() => onPostpone(g.tasks)}
                >
                  미루기
                </button>
              )}
            </div>
            {!isCollapsed &&
              g.tasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  selected={t.id === selectedId}
                  now={now}
                  showDate={g.key !== 'today'}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  onMenu={(id, x, y) => setMenu({ id, x, y })}
                />
              ))}
          </div>
        )
      })}

      {menu && (
        <div
          className="ctx-menu"
          role="menu"
          style={{
            left: Math.min(menu.x, window.innerWidth - MENU_W),
            top: Math.min(menu.y, window.innerHeight - MENU_H),
          }}
          // 메뉴 위에서 누른 것까지 바깥 클릭으로 세지 않는다
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            ref={menuItem}
            role="menuitem"
            onClick={() => {
              onDelete(menu.id)
              setMenu(null)
            }}
          >
            삭제하기
          </button>
        </div>
      )}
    </>
  )
}
