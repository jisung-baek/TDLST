import { useMemo } from 'react'
import { calendarMarks, dateKey, monthGrid, startOfDay } from '../lib/grouping.ts'
import { CATEGORY_COLOR, CATEGORY_LABEL, type Task } from '../lib/types.ts'
import { Chevron } from './Icons.tsx'

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
  /*
   * monthGrid 는 늘 6주를 준다. 그대로 그리면 5주짜리 달은 다음 달 한 줄이
   * 통째로 흐릿하게 남아 자리만 먹고, 최소 창 높이에서는 그 줄 때문에 아래가 잘린다.
   * 이번 달 날짜가 하나도 없는 주는 버린다.
   */
  const weeks = useMemo(() => {
    const grid = monthGrid(month)
    const out: Date[][] = []
    for (let i = 0; i < grid.length; i += 7) {
      const week = grid.slice(i, i + 7)
      if (week.some((d) => d.getMonth() === month.getMonth())) out.push(week)
    }
    return out
  }, [month])
  const marks = useMemo(() => calendarMarks(tasks, now), [tasks, now])

  const todayKey = dateKey(now)
  const selectedKey = selected ? dateKey(selected) : null

  // 접힌 상태에서는 고른 날(없으면 오늘)이 든 한 주만 남긴다. 다 숨기면 날짜를 고를 수가 없다.
  const focusKey = dateKey(startOfDay(selected ?? now))
  const visibleWeeks = collapsed
    ? weeks.filter((w) => w.some((d) => dateKey(d) === focusKey)).slice(0, 1)
    : weeks
  const shown = visibleWeeks.length ? visibleWeeks : weeks.slice(0, 1)

  return (
    <div className={'calendar' + (collapsed ? ' collapsed' : '')}>
      <div className="cal-head">
        {/* 접기는 폰에서만 의미가 있다. 버튼이어야 키보드·스크린리더로도 찾을 수 있다. */}
        <button
          className="cal-title"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? '달력 펼치기' : '달력 접기'}
        >
          {month.getFullYear()}년 {month.getMonth() + 1}월
          {/* 접힘 = 아래(펼칠 수 있음), 펼침 = 위. 오른쪽(›)을 쓰면 '다음 달' 버튼과 헷갈린다. */}
          <Chevron className="cal-title-caret" dir={collapsed ? 'down' : 'up'} />
        </button>
        {/* 이동 버튼은 한 덩어리로 오른쪽에 모은다. 제목과 '오늘' 사이에 빈 띠가 생기지 않게. */}
        <div className="cal-actions">
          <button className="cal-today-btn" onClick={onToday}>
            오늘
          </button>
          <button className="cal-nav" onClick={() => onMonthShift(-1)} aria-label="이전 달">
            <Chevron dir="left" />
          </button>
          <button className="cal-nav" onClick={() => onMonthShift(1)} aria-label="다음 달">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={'cal-weekday' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
            {w}
          </div>
        ))}
      </div>

      <div className="cal-grid" style={{ '--weeks': shown.length } as React.CSSProperties}>
        {shown.flat().map((d) => {
          const key = dateKey(d)
          const mark = marks.get(key)
          const outside = d.getMonth() !== month.getMonth()
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const classes = [
            'cal-cell',
            outside ? 'outside' : '',
            isToday ? 'today' : '',
            isSelected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          // 점은 눈으로만 읽힌다. 같은 정보를 글로도 준다.
          const label =
            `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일` +
            (mark
              ? ` · 할 일 ${mark.total}개 (${mark.categories.map((c) => CATEGORY_LABEL[c]).join('·')})` +
                (mark.hasOverdue ? ' · 지연 있음' : '')
              : '')

          return (
            <button
              key={key}
              className={classes}
              aria-label={label}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              // 같은 날짜를 다시 누르면 기본 목록으로 돌아간다
              onClick={() => onSelect(isSelected ? null : d)}
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
