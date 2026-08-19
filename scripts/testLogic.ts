import { nextOccurrence } from '../src/lib/repeat.ts'
import { groupTasks, tasksForDate, calendarMarks, monthGrid, dateKey } from '../src/lib/grouping.ts'
import type { Task } from '../src/lib/types.ts'

const NOW = new Date(2026, 7, 18, 10, 0, 0) // 2026-08-18 (화) 10:00

let pass = 0
let fail = 0

function check(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got)
  const w = JSON.stringify(want)
  if (g === w) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n         expected ${w}\n         got      ${g}`)
  }
}

// ── 반복 ────────────────────────────────────────────────
console.log('\nrepeat')

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString()
const show = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

check('매일 — 하루 뒤', show(nextOccurrence(at(2026, 8, 18), 'daily', NOW)), '2026-08-19 09:00')
check('매주 — 이레 뒤', show(nextOccurrence(at(2026, 8, 18), 'weekly', NOW)), '2026-08-25 09:00')
check('매월 — 한 달 뒤', show(nextOccurrence(at(2026, 8, 18), 'monthly', NOW)), '2026-09-18 09:00')
check('매월 — 말일 보정', show(nextOccurrence(at(2027, 1, 31), 'monthly', NOW)), '2027-02-28 09:00')
check('반복 없음', nextOccurrence(at(2026, 8, 18), 'none', NOW), null)
// 며칠 밀린 반복을 완료하면 다시 지연 상태가 되면 안 된다
check('매일 — 8일 밀린 것', show(nextOccurrence(at(2026, 8, 10), 'daily', NOW)), '2026-08-19 09:00')
// 8/18 09:00 은 기준 시각(10:00)보다 이르므로 한 주 더 전진해야 한다
check('매주 — 3주 밀린 것', show(nextOccurrence(at(2026, 7, 28), 'weekly', NOW)), '2026-08-25 09:00')

// ── 그룹핑 ──────────────────────────────────────────────
console.log('\ngrouping')

let seq = 0
function task(partial: Partial<Task>): Task {
  seq++
  return {
    id: `t${seq}`,
    user_id: 'u',
    title: `task${seq}`,
    notes: null,
    due_at: null,
    is_all_day: true,
    category: 'academic',
    repeat: 'none',
    completed_at: null,
    remind_at: null,
    created_at: `2026-01-0${(seq % 9) + 1}T00:00:00.000Z`,
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...partial,
  }
}

const overdue = task({ title: '지난 레포트', due_at: at(2026, 8, 15) })
const todayAllDay = task({ title: '오늘 종일', due_at: at(2026, 8, 18, 0), is_all_day: true })
const todayTimed = task({ title: '오늘 15시', due_at: at(2026, 8, 18, 15), is_all_day: false })
const soon = task({ title: '사흘 뒤', due_at: at(2026, 8, 21) })
const far = task({ title: '한 달 뒤', due_at: at(2026, 9, 20) })
const someday = task({ title: '언젠가' })
const done = task({ title: '끝난 것', due_at: at(2026, 8, 17), completed_at: at(2026, 8, 17, 20) })
const removed = task({ title: '지워진 것', deleted_at: at(2026, 8, 1) })

const all = [far, someday, todayTimed, overdue, done, soon, todayAllDay, removed]
const groups = groupTasks(all, NOW)

check(
  '그룹 구성',
  groups.map((g) => [g.key, g.tasks.length]),
  [
    ['overdue', 1],
    ['today', 2],
    ['upcoming', 1],
    ['later', 1],
    ['someday', 1],
    ['done', 1],
  ],
)
check(
  '오늘 그룹 — 종일이 먼저',
  groups.find((g) => g.key === 'today')!.tasks.map((t) => t.title),
  ['오늘 종일', '오늘 15시'],
)
check('삭제된 항목은 어느 그룹에도 없음', groups.every((g) => g.tasks.every((t) => !t.deleted_at)), true)
check('그 이후 그룹은 기본 접힘', groups.find((g) => g.key === 'later')!.collapsed, true)
check('완료 그룹은 기본 접힘', groups.find((g) => g.key === 'done')!.collapsed, true)
check('빈 그룹은 나오지 않음', groupTasks([], NOW).length, 0)

// ── 날짜 선택 ────────────────────────────────────────────
console.log('\ntasksForDate')

const picked = tasksForDate(all, new Date(2026, 7, 18))
check('8/18 미완료', picked.open.map((t) => t.title), ['오늘 종일', '오늘 15시'])
check('8/18 완료', picked.done.length, 0)
check('8/17 완료 항목', tasksForDate(all, new Date(2026, 7, 17)).done.map((t) => t.title), ['끝난 것'])

// ── 달력 표식 ────────────────────────────────────────────
console.log('\ncalendarMarks')

const marks = calendarMarks(
  [
    task({ due_at: at(2026, 8, 20), category: 'academic' }),
    task({ due_at: at(2026, 8, 20), category: 'other' }),
    task({ due_at: at(2026, 8, 20), category: 'academic' }),
    task({ due_at: at(2026, 8, 15), category: 'other' }),
    task({ due_at: at(2026, 8, 20), completed_at: at(2026, 8, 19) }),
  ],
  NOW,
)
check('같은 카테고리는 점 하나로', marks.get('2026-08-20')!.categories, ['academic', 'other'])
check('완료 항목은 점을 만들지 않음', marks.get('2026-08-20')!.total, 3)
check('지난 날짜는 지연 표시', marks.get('2026-08-15')!.hasOverdue, true)
check('미래 날짜는 지연 아님', marks.get('2026-08-20')!.hasOverdue, false)

// ── 월간 그리드 ──────────────────────────────────────────
console.log('\nmonthGrid')

const grid = monthGrid(new Date(2026, 7, 1))
check('42칸', grid.length, 42)
check('일요일 시작', grid[0].getDay(), 0)
check('첫 칸은 7월 26일', dateKey(grid[0]), '2026-07-26')
check('8월 1일 포함', grid.some((d) => dateKey(d) === '2026-08-01'), true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
