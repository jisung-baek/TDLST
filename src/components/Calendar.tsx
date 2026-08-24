import { useMemo } from 'react'
import { calendarMarks, dateKey, monthGrid } from '../lib/grouping.ts'
import { CATEGORY_COLOR, type Task } from '../lib/types.ts'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  month: Date
  tasks: Task[]
  selected: Date | null
  now: Date
  collapsed: boolean
  onMonthShift: (delta: number) => void
  onToday: () => void
  onSelect: (d: Date | null) => void
  onToggleCollapsed: () => void
}

export default function Calendar({
  month,
  tasks,
  selected,
  now,
  collapsed,
  onMonthShift,
  onToday,
  onSelect,
  onToggleCollapsed,
}: Props) {
  const days = useMemo(() => monthGrid(month), [month])
  const marks = useMemo(() => calendarMarks(tasks, now), [tasks, now])

  const todayKey = dateKey(now)
  const selectedKey = selected ? dateKey(selected) : null

  return (
    <div className={'calendar' + (collapsed ? ' collapsed' : '')}>
      {/* 40px 제목을 사이에 끼면 좌우 버튼이 너무 멀어진다. 제목 → 스테퍼 → 오늘 순. */}
      <div className="cal-head">
        <div className="cal-title" onClick={onToggleCollapsed}>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </div>
        <div className="cal-steppers">
          <button className="cal-nav" onClick={() => onMonthShift(-1)} title="이전 달">
            ‹
          </button>
          <button className="cal-nav" onClick={() => onMonthShift(1)} title="다음 달">
            ›
          </button>
        </div>
        <button className="cal-today-btn" onClick={onToday}>
          오늘
        </button>
      </div>

      <div className="cal-weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={'cal-weekday' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
            {w}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {days.map((d) => {
          const key = dateKey(d)
          const mark = marks.get(key)
          const outside = d.getMonth() !== month.getMonth()
          const classes = [
            'cal-cell',
            outside ? 'outside' : '',
            key === todayKey ? 'today' : '',
            key === selectedKey ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={key}
              className={classes}
              // 같은 날짜를 다시 누르면 기본 목록으로 돌아간다
              onClick={() => onSelect(key === selectedKey ? null : d)}
            >
              <span className="cal-daynum">{d.getDate()}</span>
              <span className="cal-dots">
                {mark?.categories.map((c) => (
                  <span
                    key={c}
                    className={'cal-dot' + (mark.hasOverdue ? ' overdue' : '')}
                    style={{ background: CATEGORY_COLOR[c] }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
