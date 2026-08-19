/**
 * 로그인 없이 위젯 화면을 보기 위한 진입점. `/demo.html` 로 연다.
 *
 * 목 데이터를 로컬 캐시에 심어두면 스토어가 서버 응답을 기다리지 않고
 * 캐시부터 그리기 때문에 그대로 화면이 나온다. 서버 호출은 실패하지만
 * 오프라인과 같은 경로라 렌더에는 지장이 없다.
 *
 * 프로덕션 빌드에는 포함되지 않는다 (vite 는 index.html 만 진입점으로 잡는다).
 */
import { createRoot } from 'react-dom/client'
import { Widget } from './App.tsx'
import * as cache from './lib/db.ts'
import type { Task } from './lib/types.ts'
import './styles/global.css'

const now = new Date()
const day = (offset: number, hour?: number): string => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour ?? 0)
  return d.toISOString()
}

let n = 0
const mk = (partial: Partial<Task>): Task => {
  n++
  return {
    id: `demo-${n}`,
    user_id: 'demo',
    title: '',
    notes: null,
    due_at: null,
    is_all_day: true,
    category: 'academic',
    repeat: 'none',
    completed_at: null,
    remind_at: null,
    created_at: day(-30),
    updated_at: day(-30),
    deleted_at: null,
    ...partial,
  }
}

const demoTasks: Task[] = [
  mk({ title: '통계학 과제 3장', due_at: day(-2) }),
  mk({ title: '조교 면담 신청', due_at: day(-1, 16), is_all_day: false, category: 'other' }),
  mk({ title: '알고리즘 중간 정리', due_at: day(0) }),
  mk({ title: '스터디 발표 준비', due_at: day(0, 15), is_all_day: false, notes: '# 발표 순서\n\n- 서론 5분\n- 실험 결과\n- 질의응답' }),
  mk({ title: '헬스장', due_at: day(0, 20), is_all_day: false, category: 'other', repeat: 'daily' }),
  mk({ title: '논문 초안 제출', due_at: day(2, 23) , is_all_day: false }),
  mk({ title: '동아리 회비 납부', due_at: day(4), category: 'other' }),
  mk({ title: '전공 세미나', due_at: day(6, 14), is_all_day: false, repeat: 'weekly' }),
  mk({ title: '기말 프로젝트 제안서', due_at: day(21) }),
  mk({ title: '읽을 논문 정리', notes: '- Attention Is All You Need\n- ResNet' }),
  mk({ title: '노트북 백업', category: 'other' }),
  mk({ title: '지난 주 과제 제출', due_at: day(-3), completed_at: day(-3, 22) }),
  mk({ title: '도서관 책 반납', due_at: day(-1), completed_at: day(-1, 18), category: 'other' }),
]

await cache.cacheReplaceAll(demoTasks)

createRoot(document.getElementById('root')!).render(<Widget userId="demo" />)
