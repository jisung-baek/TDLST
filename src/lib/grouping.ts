import type { Category, Task } from './types.ts'

/**
 * 사이드 리스트의 그룹 구성 (SPEC §3).
 *
 * SPEC 의 레이아웃에는 지연 / 오늘 / 예정(7일) / 언젠가 만 그려져 있는데,
 * 그대로 두면 8일 뒤 이후 항목이 어느 그룹에도 속하지 못하고 사라진다.
 * 정보 손실을 막기 위해 '그 이후' 그룹을 두되 기본값을 접힘으로 한다.
 */

export type GroupKey = 'overdue' | 'today' | 'upcoming' | 'later' | 'someday' | 'done'

export interface TaskGroup {
  key: GroupKey
  label: string
  tasks: Task[]
  /** 기본으로 접어둘 그룹 */
  collapsed: boolean
}

const UPCOMING_DAYS = 7

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayDiff = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)

/**
 * 그룹 안에서의 순서.
 * 종일 항목을 먼저 올리고, 시각이 있는 항목은 이른 순으로 뒤에 붙인다.
 */
function byDueThenCreated(a: Task, b: Task): number {
  const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity
  const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity
  const aDay = a.due_at ? startOfDay(new Date(a.due_at)).getTime() : Infinity
  const bDay = b.due_at ? startOfDay(new Date(b.due_at)).getTime() : Infinity

  if (aDay !== bDay) return aDay - bDay
  if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1
  if (ad !== bd) return ad - bd
  return a.created_at.localeCompare(b.created_at)
}

export function groupTasks(tasks: Task[], now: Date = new Date()): TaskGroup[] {
  const overdue: Task[] = []
  const today: Task[] = []
  const upcoming: Task[] = []
  const later: Task[] = []
  const someday: Task[] = []
  const done: Task[] = []

  for (const t of tasks) {
    if (t.deleted_at) continue
    if (t.completed_at) {
      done.push(t)
      continue
    }
    if (!t.due_at) {
      someday.push(t)
      continue
    }
    const diff = dayDiff(new Date(t.due_at), now)
    if (diff < 0) overdue.push(t)
    else if (diff === 0) today.push(t)
    else if (diff <= UPCOMING_DAYS) upcoming.push(t)
    else later.push(t)
  }

  overdue.sort(byDueThenCreated)
  today.sort(byDueThenCreated)
  upcoming.sort(byDueThenCreated)
  later.sort(byDueThenCreated)
  someday.sort((a, b) => a.created_at.localeCompare(b.created_at))
  // 완료는 최근에 끝낸 것부터
  done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  return [
    { key: 'overdue', label: '지연', tasks: overdue, collapsed: false },
    { key: 'today', label: '오늘', tasks: today, collapsed: false },
    { key: 'upcoming', label: '예정', tasks: upcoming, collapsed: false },
    { key: 'later', label: '그 이후', tasks: later, collapsed: true },
    { key: 'someday', label: '언젠가', tasks: someday, collapsed: false },
    { key: 'done', label: '완료됨', tasks: done, collapsed: true },
  ].filter((g) => g.tasks.length > 0) as TaskGroup[]
}

/** 달력에서 특정 날짜를 클릭했을 때 보여줄 목록 */
export function tasksForDate(tasks: Task[], date: Date): { open: Task[]; done: Task[] } {
  const key = dateKey(date)
  const open: Task[] = []
  const done: Task[] = []
  for (const t of tasks) {
    if (t.deleted_at || !t.due_at) continue
    if (dateKey(new Date(t.due_at)) !== key) continue
    ;(t.completed_at ? done : open).push(t)
  }
  open.sort(byDueThenCreated)
  done.sort(byDueThenCreated)
  return { open, done }
}

export interface DayMark {
  categories: Category[]
  hasOverdue: boolean
  total: number
}

/**
 * 달력 날짜 칸에 찍을 표식.
 * 카테고리별로 점을 하나씩만 찍는다 (최대 2개).
 */
export function calendarMarks(tasks: Task[], now: Date = new Date()): Map<string, DayMark> {
  const marks = new Map<string, DayMark>()
  for (const t of tasks) {
    if (t.deleted_at || t.completed_at || !t.due_at) continue
    const due = new Date(t.due_at)
    const key = dateKey(due)
    const mark = marks.get(key) ?? { categories: [], hasOverdue: false, total: 0 }
    if (!mark.categories.includes(t.category)) mark.categories.push(t.category)
    if (dayDiff(due, now) < 0) mark.hasOverdue = true
    mark.total += 1
    marks.set(key, mark)
  }
  return marks
}

/** 월간 그리드용 6주(42칸) 날짜 배열. 일요일 시작. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}
