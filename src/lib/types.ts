export type Category = 'academic' | 'other'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Task {
  id: string
  user_id: string
  title: string
  notes: string | null
  /** ISO 8601. null이면 '언젠가' 그룹으로 간다. */
  due_at: string | null
  /** true면 시각을 표시하지 않고 그날 목록 맨 위에 놓는다. */
  is_all_day: boolean
  category: Category
  repeat: Repeat
  completed_at: string | null
  /** 알림 기능은 미구현. 나중에 붙일 수 있도록 컬럼만 확보해 둔다. */
  remind_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** 서버로 보내기 전 로컬에서 만든 신규 task */
export type NewTask = Pick<Task, 'title' | 'notes' | 'due_at' | 'is_all_day' | 'category' | 'repeat'>

export const CATEGORY_LABEL: Record<Category, string> = {
  academic: '학업',
  other: '기타',
}

export const CATEGORY_COLOR: Record<Category, string> = {
  academic: '#5b9cff',
  other: '#f2a33c',
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: '반복 안 함',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
}
