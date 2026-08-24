/**
 * 입력창 한 줄에서 마감일을 뽑아낸다.
 *
 * 숫자 형식과 한국어 자연어 표현('오늘', '내일', '다음주 월요일')을 함께 다룬다.
 * 숫자로 적은 날짜가 언제나 우선한다 — 명시적인 입력을 말뜻이 덮으면 안 된다.
 *
 * 외부 의존성 없음 — scripts/testParser.ts 로 단독 검증 가능.
 */

export interface ParsedInput {
  /** 날짜 토큰을 제거하고 공백을 정리한 제목 */
  title: string
  dueAt: Date | null
  isAllDay: boolean
  /** 원문에서 날짜로 해석된 구간. 미리보기와 해제 UI에 쓴다. */
  matchedText: string | null
}

/** 이만큼 이내의 과거는 롤오버하지 않는다. 지연된 항목을 뒤늦게 적는 경우를 위해. */
const PAST_GRACE_DAYS = 7

// ── 날짜 패턴 ──────────────────────────────────────────────
// 앞뒤에 숫자나 콜론이 붙으면 매치하지 않는다 (15:00, 8/191 등을 걸러냄)
const RE_YMD = /(?<![\d:])(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?![\d:])/
const RE_KMD = /(?<![\d:])(\d{1,2})\s*월\s*(\d{1,2})\s*일/
const RE_MD = /(?<![\d:])(\d{1,2})[/-](\d{1,2})(?![\d:/])/
const RE_D = /(?<![\d:])(\d{1,2})\s*일(?!\s*[간차째])/

// ── 자연어 날짜 ────────────────────────────────────────────
// 패턴은 정규식 리터럴로 적고 .source 로 이어붙인다.
// 문자열로 적으면 역슬래시를 두 번 써야 해서 조용히 틀리기 쉽다.

/** 날짜 표현에 붙은 조사. 같이 걷어내야 제목이 깨끗하다 ('오늘까지 정산' → '정산') */
const PARTICLE = /(?:\s*(?:까지는|까지|까진|안에|중에|에는|에|은|는|의))?/
const withParticle = (re: RegExp) => new RegExp(re.source + PARTICLE.source)

/** 오늘에서 며칠 떨어진 날인지. 긴 표현이 먼저 와야 '내일모레'가 '내일'로 잘리지 않는다. */
const REL_DAY: Array<[RegExp, number]> = [
  [withParticle(/(?:내일|낼)?\s*모레/), 2],
  [withParticle(/글피/), 3],
  [withParticle(/오늘/), 0],
  [withParticle(/내일/), 1],
  [withParticle(/어제/), -1],
  [withParticle(/(?:그저께|그제)/), -2],
]

// '이번 주' 류 접두사. 긴 것부터 — '다음주'가 '다다음주'를 먼저 먹으면 안 된다.
const WEEK_PREFIX = /(?:이번\s*주|금주|다다음\s*주|다음\s*주|담주|차주)/
const OPT_WEEK = '(' + WEEK_PREFIX.source + ')?'

const RE_AFTER_N = withParticle(/(?<![\d:])(\d{1,3})\s*(일|주일|주|개월|달)\s*(?:뒤|후)/)
const RE_WEEKDAY = withParticle(new RegExp(OPT_WEEK + /\s*([월화수목금토일])\s*요일/.source))
const RE_WEEKEND = withParticle(new RegExp(OPT_WEEK + /\s*주말/.source))
const RE_WEEK_ONLY = withParticle(/(다다음\s*주|다음\s*주|담주|차주)/)

const DOW = '일월화수목금토'

// ── 시각 패턴 ──────────────────────────────────────────────
const RE_HM = /(?<![\d])(\d{1,2}):(\d{2})\s*([ap]m)?(?![\d])/i
const RE_H_AP = /(?<![\d])(\d{1,2})\s*([ap]m)(?![\d])/i
const RE_KH = /(오전|오후)?\s*(?<![\d])(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?/

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const diffInDays = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)

const addDays = (d: Date, n: number) => {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 그 주의 월요일. 한국에서 '이번 주'는 월요일에 시작한다. */
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

/** '다음 주' 류 접두사가 몇 주를 미루는지. 접두사가 없으면 null. */
function weekShift(prefix: string | undefined): number | null {
  if (!prefix) return null
  const p = prefix.replace(/\s+/g, '')
  if (p === '이번주' || p === '금주') return 0
  if (p === '다다음주') return 2
  return 1 // 다음주 · 담주 · 차주
}

/** 실제로 존재하는 날짜인지 확인한다 (2/30, 4/31 등을 거른다) */
function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/** 연도가 생략된 월/일을 해석한다. 너무 지났으면 내년으로 넘긴다. */
function resolveYear(month: number, day: number, now: Date): Date | null {
  const thisYear = makeDate(now.getFullYear(), month, day)
  if (thisYear && diffInDays(thisYear, now) >= -PAST_GRACE_DAYS) return thisYear
  const nextYear = makeDate(now.getFullYear() + 1, month, day)
  // 2/29 처럼 내년에 없는 날이면 올해 것을 그대로 쓴다
  return nextYear ?? thisYear
}

/** 일자만 주어진 경우. 이번 달 기준, 너무 지났으면 다음 달. */
function resolveMonth(day: number, now: Date): Date | null {
  const thisMonth = makeDate(now.getFullYear(), now.getMonth() + 1, day)
  if (thisMonth && diffInDays(thisMonth, now) >= -PAST_GRACE_DAYS) return thisMonth
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return makeDate(next.getFullYear(), next.getMonth() + 1, day) ?? thisMonth
}

interface Hit {
  value: Date | { hour: number; minute: number }
  start: number
  end: number
}

/**
 * 한국어 자연어 날짜. 모두 종일로 잡고, 시각은 findTime 이 따로 얹는다.
 *
 * 숫자 날짜를 먼저 본 뒤에 호출된다 — '8/19 다음주'처럼 둘 다 있으면 숫자가 이긴다.
 */
function findRelative(src: string, now: Date): Hit | null {
  let m: RegExpExecArray | null

  for (const [re, delta] of REL_DAY) {
    if ((m = re.exec(src))) {
      return {
        value: addDays(now, delta),
        start: m.index,
        end: m.index + m[0].length,
      }
    }
  }

  if ((m = RE_AFTER_N.exec(src))) {
    const n = +m[1]
    let d: Date
    if (m[2] === '일') {
      d = addDays(now, n)
    } else if (m[2] === '주' || m[2] === '주일') {
      d = addDays(now, n * 7)
    } else {
      d = startOfDay(now)
      const day = d.getDate()
      d.setMonth(d.getMonth() + n)
      if (d.getDate() !== day) d.setDate(0) // 31일 → 짧은 달이면 말일로
    }
    return { value: d, start: m.index, end: m.index + m[0].length }
  }

  if ((m = RE_WEEKDAY.exec(src))) {
    const shift = weekShift(m[1])
    const target = DOW.indexOf(m[2])
    // 접두사가 없으면 오늘 포함 '돌아오는' 그 요일, 있으면 그 주의 그 요일
    const d =
      shift === null
        ? addDays(now, (target - now.getDay() + 7) % 7)
        : addDays(mondayOf(now), shift * 7 + ((target + 6) % 7))
    return { value: d, start: m.index, end: m.index + m[0].length }
  }

  if ((m = RE_WEEKEND.exec(src))) {
    const shift = weekShift(m[1])
    const d =
      shift === null
        ? addDays(now, (6 - now.getDay() + 7) % 7) // 돌아오는 토요일
        : addDays(mondayOf(now), shift * 7 + 5)
    return { value: d, start: m.index, end: m.index + m[0].length }
  }

  if ((m = RE_WEEK_ONLY.exec(src))) {
    // 요일 없이 '다음주'만 적었으면 그 주의 시작(월요일)으로 본다
    const d = addDays(mondayOf(now), (weekShift(m[1]) ?? 1) * 7)
    return { value: d, start: m.index, end: m.index + m[0].length }
  }

  return null
}

function findDate(src: string, now: Date): Hit | null {
  let m: RegExpExecArray | null

  if ((m = RE_YMD.exec(src))) {
    const d = makeDate(+m[1], +m[2], +m[3])
    if (d) return { value: d, start: m.index, end: m.index + m[0].length }
  }
  if ((m = RE_KMD.exec(src))) {
    const d = resolveYear(+m[1], +m[2], now)
    if (d) return { value: d, start: m.index, end: m.index + m[0].length }
  }
  if ((m = RE_MD.exec(src))) {
    const d = resolveYear(+m[1], +m[2], now)
    if (d) return { value: d, start: m.index, end: m.index + m[0].length }
  }
  // '3일 후'가 RE_D 에 '3일'로 먹히지 않도록 일자 단독 패턴보다 앞에서 본다
  const relative = findRelative(src, now)
  if (relative) return relative
  if ((m = RE_D.exec(src))) {
    const d = resolveMonth(+m[1], now)
    if (d) return { value: d, start: m.index, end: m.index + m[0].length }
  }
  return null
}

function applyMeridiem(hour: number, marker: string | undefined): number | null {
  if (hour < 0 || hour > 23) return null
  if (!marker) return hour
  const isPm = /pm/i.test(marker) || marker === '오후'
  if (hour < 1 || hour > 12) return null
  if (isPm) return hour === 12 ? 12 : hour + 12
  return hour === 12 ? 0 : hour
}

function findTime(src: string): Hit | null {
  let m: RegExpExecArray | null

  if ((m = RE_HM.exec(src))) {
    const hour = applyMeridiem(+m[1], m[3])
    const minute = +m[2]
    if (hour !== null && minute < 60) {
      return {
        value: { hour, minute },
        start: m.index,
        end: m.index + m[0].length,
      }
    }
  }
  if ((m = RE_H_AP.exec(src))) {
    const hour = applyMeridiem(+m[1], m[2])
    if (hour !== null) {
      return {
        value: { hour, minute: 0 },
        start: m.index,
        end: m.index + m[0].length,
      }
    }
  }
  if ((m = RE_KH.exec(src))) {
    const hour = applyMeridiem(+m[2], m[1])
    const minute = m[3] ? +m[3] : m[4] ? 30 : 0
    if (hour !== null && minute < 60) {
      return {
        value: { hour, minute },
        start: m.index,
        end: m.index + m[0].length,
      }
    }
  }
  return null
}

const cut = (s: string, start: number, end: number) => s.slice(0, start) + '\u0000' + s.slice(end)

const tidy = (s: string) =>
  s
    .replace(/\u0000/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()

export function parseTaskInput(raw: string, now: Date = new Date()): ParsedInput {
  const input = raw.trim()
  if (!input) return { title: '', dueAt: null, isAllDay: true, matchedText: null }

  const dateHit = findDate(input, now)
  // 날짜로 먹은 구간에서 시각을 다시 찾지 않도록 잘라낸 문자열에서 검색한다
  const afterDate = dateHit ? cut(input, dateHit.start, dateHit.end) : input
  const timeHit = findTime(afterDate)

  if (!dateHit && !timeHit) {
    return { title: input, dueAt: null, isAllDay: true, matchedText: null }
  }

  let dueAt: Date
  let isAllDay: boolean

  if (dateHit) {
    dueAt = new Date((dateHit.value as Date).getTime())
    if (timeHit) {
      const t = timeHit.value as { hour: number; minute: number }
      dueAt.setHours(t.hour, t.minute, 0, 0)
      isAllDay = false
    } else {
      dueAt.setHours(0, 0, 0, 0)
      isAllDay = true
    }
  } else {
    // 시각만 있는 경우: 오늘로 잡되 이미 지났으면 내일로 넘긴다.
    // 방금 적은 할 일이 곧바로 '지연'으로 뜨는 것을 막기 위함.
    const t = timeHit!.value as { hour: number; minute: number }
    dueAt = startOfDay(now)
    dueAt.setHours(t.hour, t.minute, 0, 0)
    if (dueAt.getTime() <= now.getTime()) dueAt.setDate(dueAt.getDate() + 1)
    isAllDay = false
  }

  let rest = afterDate
  if (timeHit) rest = cut(rest, timeHit.start, timeHit.end)

  const matchedParts: string[] = []
  if (dateHit) matchedParts.push(input.slice(dateHit.start, dateHit.end))
  if (timeHit) matchedParts.push(afterDate.slice(timeHit.start, timeHit.end).trim())

  return {
    title: tidy(rest),
    dueAt,
    isAllDay,
    matchedText: matchedParts.join(' '),
  }
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 입력창 아래 미리보기용 문자열: "8월 19일 (수) 15:00" */
export function formatDuePreview(due: Date, isAllDay: boolean): string {
  const base = `${due.getMonth() + 1}월 ${due.getDate()}일 (${WEEKDAY[due.getDay()]})`
  if (isAllDay) return base
  const hh = String(due.getHours()).padStart(2, '0')
  const mm = String(due.getMinutes()).padStart(2, '0')
  return `${base} ${hh}:${mm}`
}
