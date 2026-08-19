import type { Repeat } from './types.ts'

/**
 * 반복 항목은 인스턴스를 따로 만들지 않는다 (SPEC §5).
 * 완료하면 due_at 을 다음 주기로 밀고 completed_at 을 비운다.
 */

/** 월 말일 보정: 1/31 에 한 달을 더하면 2/28 로 맞춘다. */
function addMonthsClamped(d: Date, n: number): Date {
  const day = d.getDate()
  const shifted = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes(), 0, 0)
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate()
  shifted.setDate(Math.min(day, lastDay))
  return shifted
}

function step(d: Date, repeat: Repeat): Date {
  switch (repeat) {
    case 'daily': {
      const n = new Date(d)
      n.setDate(n.getDate() + 1)
      return n
    }
    case 'weekly': {
      const n = new Date(d)
      n.setDate(n.getDate() + 7)
      return n
    }
    case 'monthly':
      return addMonthsClamped(d, 1)
    default:
      return d
  }
}

/**
 * 다음 마감일을 구한다.
 *
 * 며칠 밀린 반복 항목을 완료했을 때 여전히 지연 상태로 남지 않도록,
 * 현재 시각을 넘어설 때까지 주기를 전진시킨다.
 */
export function nextOccurrence(dueAt: string, repeat: Repeat, now: Date = new Date()): string | null {
  if (repeat === 'none') return null

  let d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return null

  // 최대 반복 횟수를 두어 시계 이상 등으로 무한 루프에 빠지지 않게 한다
  for (let i = 0; i < 1000; i++) {
    d = step(d, repeat)
    if (d.getTime() > now.getTime()) break
  }
  return d.toISOString()
}
