import { useState } from 'react'
import type { GroupKey, TaskGroup } from '../lib/grouping.ts'
import { startOfDay } from '../lib/grouping.ts'
import { CATEGORY_COLOR, type Task } from '../lib/types.ts'

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

interface ItemProps {
  task: Task
  selected: boolean
  now: Date
  showDate: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

function TaskItem({ task, selected, now, showDate, onToggle, onOpen }: ItemProps) {
  const done = !!task.completed_at
  const overdue =
    !done && !!task.due_at && new Date(task.due_at).getTime() < startOfDay(now).getTime()
  const time = timeLabel(task)
  const date = showDate ? dateLabel(task, now) : null

  return (
    <div
      className={'task' + (done ? ' done' : '') + (selected ? ' selected' : '')}
      onClick={() => onOpen(task.id)}
    >
      <button
        className={'task-check' + (done ? ' done' : '')}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(task.id)
        }}
        title={done ? '완료 취소' : '완료'}
      />
      <span className="task-bar" style={{ background: CATEGORY_COLOR[task.category] }} />
      <div className="task-body">
        <div className="task-title">{task.title}</div>
        {(date || time || task.repeat !== 'none' || task.notes) && (
          <div className="task-meta">
            {date && <span className={overdue ? 'overdue' : undefined}>{date}</span>}
            {time && <span className={overdue ? 'overdue' : undefined}>{time}</span>}
            {task.repeat !== 'none' && <span title="반복">↻</span>}
            {task.notes && <span className="task-note-mark" title="메모 있음">≡</span>}
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
}

export default function TaskList({ groups, selectedId, now, onToggle, onOpen }: Props) {
  // 접힘 상태는 그룹이 사라졌다 나타나도 유지되도록 key 로 들고 있는다
  const [collapsed, setCollapsed] = useState<Partial<Record<GroupKey, boolean>>>({
    later: true,
    done: true,
  })

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
        return (
          <div className="group" key={g.key}>
            <button
              className={'group-head' + (g.key === 'overdue' ? ' overdue' : '')}
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}
            >
              <span className={'caret' + (isCollapsed ? '' : ' open')}>▶</span>
              {g.label}
              <span className="group-count">{g.tasks.length}</span>
            </button>
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
                />
              ))}
          </div>
        )
      })}
    </>
  )
}
