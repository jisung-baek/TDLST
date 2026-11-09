import { useMemo, useRef, useState } from 'react'
import { formatDuePreview, parseTaskInput } from '../lib/dateParser.ts'
import { CATEGORY_COLOR, CATEGORY_LABEL, type Category, type NewTask } from '../lib/types.ts'
import { XIcon } from './Icons.tsx'

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
    } else if ((e.key === 'Tab' || e.code === 'Tab') && !e.shiftKey) {
      // Tab 은 항상 카테고리 토글. 입력창을 빠져나갈 때는 Shift+Tab 이나 Esc.
      // 한글 조합 중에는 key 가 'Process' 로 오기도 해서 code 도 본다.
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
          placeholder="할 일 입력"
          aria-label="할 일 입력. 날짜와 시각을 같이 적으면 알아서 인식합니다"
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
          aria-label={`분류: ${CATEGORY_LABEL[category]}. 눌러서 전환`}
        >
          <span className="cat-swatch" style={{ background: CATEGORY_COLOR[category] }} />
        </button>
      </div>

      {value !== '' && effectiveDue && (
        <div className="due-preview">
          <span>→ {formatDuePreview(effectiveDue, effectiveAllDay)}</span>
          {parsed.matchedText && !dismissed && (
            <button
              onClick={() => setDismissedFor(value)}
              title="날짜로 보지 않기"
              aria-label="날짜로 보지 않기"
            >
              <XIcon />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
