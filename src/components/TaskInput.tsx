import { useMemo, useRef, useState } from 'react'
import { formatDuePreview, parseTaskInput } from '../lib/dateParser.ts'
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category, type NewTask } from '../lib/types.ts'

interface Props {
  /** 달력에서 날짜를 고른 상태면, 날짜를 안 적어도 그날로 넣는다 */
  defaultDate: Date | null
  onAdd: (task: NewTask) => void
}

export default function TaskInput({ defaultDate, onAdd }: Props) {
  const [value, setValue] = useState('')
  const [category, setCategory] = useState<Category>('academic')
  /** 날짜 인식을 해제한 입력값. 오인식 시 사용자가 끌 수 있다. */
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseTaskInput(value), [value])
  const dismissed = dismissedFor === value && value !== ''

  const effectiveDue = dismissed ? null : (parsed.dueAt ?? defaultDate)
  const effectiveAllDay = dismissed || !parsed.dueAt ? true : parsed.isAllDay
  const title = dismissed ? value.trim() : parsed.title

  function submit() {
    if (!title) return
    onAdd({
      title,
      notes: null,
      due_at: effectiveDue ? effectiveDue.toISOString() : null,
      is_all_day: effectiveDue ? effectiveAllDay : true,
      category,
      repeat: 'none',
    })
    setValue('')
    setDismissedFor(null)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab') {
      // 위젯에서 Tab 은 포커스를 옮길 곳이 없으니 카테고리 토글로 쓴다
      e.preventDefault()
      setCategory((c) => (c === 'academic' ? 'other' : 'academic'))
    } else if (e.key === 'Escape') {
      setValue('')
      setDismissedFor(null)
      inputRef.current?.blur()
    }
  }

  return (
    <div>
      <div className="input-row">
        <input
          ref={inputRef}
          value={value}
          placeholder="할 일 입력 — 예: 과제 제출 8/19 15:00"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          className="cat-toggle"
          onClick={() => setCategory((c) => (c === 'academic' ? 'other' : 'academic'))}
          title={`${CATEGORY_LABEL[category]} — 눌러서 전환 (Tab)`}
        >
          <span className="cat-swatch" style={{ background: CATEGORY_COLOR[category] }} />
        </button>
      </div>

      {value !== '' && effectiveDue && (
        <div className="due-preview">
          <span>→ {formatDuePreview(effectiveDue, effectiveAllDay)}</span>
          {parsed.matchedText && !dismissed && (
            <button onClick={() => setDismissedFor(value)} title="날짜로 보지 않기">
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}
