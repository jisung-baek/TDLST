import { parseTaskInput, formatDuePreview } from '../src/lib/dateParser.ts'

// 기준 시각을 고정한다: 2026년 8월 18일 (화) 10:00
const NOW = new Date(2026, 7, 18, 10, 0, 0)

const fmt = (d: Date | null, allDay: boolean) =>
  d === null ? '—' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
    (allDay ? ' (종일)' : ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)

interface Case { input: string; title: string; due: string }

const cases: Case[] = [
  { input: '과제 제출 8/19',        title: '과제 제출',   due: '2026-08-19 (종일)' },
  { input: '스터디 8/19 15:00',     title: '스터디',      due: '2026-08-19 15:00' },
  { input: '회의 8-19 3pm',         title: '회의',        due: '2026-08-19 15:00' },
  { input: '정산 19일',             title: '정산',        due: '2026-08-19 (종일)' },
  { input: '책 반납',               title: '책 반납',     due: '—' },
  { input: '2026/8/19 발표자료',    title: '발표자료',    due: '2026-08-19 (종일)' },
  { input: '8월 19일 세미나',       title: '세미나',      due: '2026-08-19 (종일)' },
  { input: '레포트 8/15',           title: '레포트',      due: '2026-08-15 (종일)' },   // 3일 전 → 지연으로 유지
  { input: '신년 행사 1/5',         title: '신년 행사',   due: '2027-01-05 (종일)' },   // 많이 지남 → 내년
  { input: '미팅 15:00',            title: '미팅',        due: '2026-08-18 15:00' },   // 오늘 남은 시각
  { input: '조깅 9:00',             title: '조깅',        due: '2026-08-19 09:00' },   // 지난 시각 → 내일
  { input: '운동 오후 7시',         title: '운동',        due: '2026-08-18 19:00' },
  { input: '리허설 8/19 14시 30분', title: '리허설',      due: '2026-08-19 14:30' },
  { input: '약속 2/30',             title: '약속 2/30',   due: '—' },                  // 없는 날짜 → 인식 안 함
  { input: '3일간 여행 준비',       title: '3일간 여행 준비', due: '—' },              // '일간'은 날짜 아님
  { input: '8/19',                  title: '',            due: '2026-08-19 (종일)' },  // 제목 없이 날짜만
  { input: '중간고사 12/22 09:30',  title: '중간고사',    due: '2026-12-22 09:30' },
  { input: '알바 정산 31일',        title: '알바 정산',   due: '2026-08-31 (종일)' },
  { input: '납부 2/31',             title: '납부 2/31',   due: '—' },                  // 2월 31일은 없음
  { input: '세미나 12pm',           title: '세미나',      due: '2026-08-18 12:00' },   // 기준 10시 → 정오는 아직 남음

  // 자연어 (기준: 2026-08-18 화)
  { input: '오늘 장보기',           title: '장보기',      due: '2026-08-18 (종일)' },
  { input: '정산 오늘까지',         title: '정산',        due: '2026-08-18 (종일)' },
  { input: '내일 발표',             title: '발표',        due: '2026-08-19 (종일)' },
  { input: '모레 회의 3pm',         title: '회의',        due: '2026-08-20 15:00' },
  { input: '내일모레 마감',         title: '마감',        due: '2026-08-20 (종일)' },
  { input: '글피 답장',             title: '답장',        due: '2026-08-21 (종일)' },
  { input: '어제 놓친 것',          title: '놓친 것',     due: '2026-08-17 (종일)' },
  { input: '금요일 스터디',         title: '스터디',      due: '2026-08-21 (종일)' },
  { input: '화요일 정기회의',       title: '정기회의',    due: '2026-08-18 (종일)' },  // 오늘이 화 → 오늘
  { input: '다음주 월요일 제출',    title: '제출',        due: '2026-08-24 (종일)' },
  { input: '이번주 금요일 회식',    title: '회식',        due: '2026-08-21 (종일)' },
  { input: '다다음주 수요일 검진',  title: '검진',        due: '2026-09-02 (종일)' },
  { input: '주말에 청소',           title: '청소',        due: '2026-08-22 (종일)' },
  { input: '다음주 정리',           title: '정리',        due: '2026-08-24 (종일)' },  // 요일 없으면 그 주 월요일
  { input: '3일 후 재검토',         title: '재검토',      due: '2026-08-21 (종일)' },
  { input: '2주 뒤 리뷰',           title: '리뷰',        due: '2026-09-01 (종일)' },
  { input: '내일 3시 반 통화',      title: '통화',        due: '2026-08-19 03:30' },
  { input: '오늘 오후 3시 반 통화', title: '통화',        due: '2026-08-18 15:30' },
  { input: '과제 8/19 오늘',        title: '과제 오늘',   due: '2026-08-19 (종일)' },  // 숫자 날짜가 우선
  { input: '3일간 여행',            title: '3일간 여행',  due: '—' },                  // '일간'은 여전히 날짜 아님
]

let pass = 0
let fail = 0

for (const c of cases) {
  const r = parseTaskInput(c.input, NOW)
  const gotDue = fmt(r.dueAt, r.isAllDay)
  const ok = r.title === c.title && gotDue === c.due
  if (ok) {
    pass++
    console.log(`  ok   ${JSON.stringify(c.input).padEnd(28)} → "${r.title}" / ${gotDue}`)
  } else {
    fail++
    console.log(`  FAIL ${JSON.stringify(c.input)}`)
    console.log(`         expected  "${c.title}" / ${c.due}`)
    console.log(`         got       "${r.title}" / ${gotDue}   (matched: ${JSON.stringify(r.matchedText)})`)
  }
}

console.log(`\n  preview sample: ${formatDuePreview(new Date(2026, 7, 19, 15, 0), false)}`)
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
