import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  REPEAT_LABEL,
  type Category,
  type Repeat,
  type Task,
} from '../lib/types.ts'
import { XIcon } from './Icons.tsx'

const loadMarkdown = () => import('./Markdown.tsx')
const Markdown = lazy(loadMarkdown)

/** 패널을 열기 전에 미리 받아둔다. 안 그러면 메모 자리에 '…' 가 한 박자 비친다. */
export const preloadMarkdown = () => void loadMarkdown()

/** <input type="date"> 는 로컬 기준 YYYY-MM-DD 를 원한다 */
function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toTimeInput(iso: string | null, isAllDay: boolean): string {
  if (!iso || isAllDay) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function composeDue(dateStr: string, timeStr: string): { due: string | null; allDay: boolean } {
  if (!dateStr) return { due: null, allDay: true }
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!timeStr)
    return {
      due: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
      allDay: true,
    }
  const [hh, mm] = timeStr.split(':').map(Number)
  return {
    due: new Date(y, m - 1, d, hh, mm, 0, 0).toISOString(),
    allDay: false,
  }
}

interface Props {
  task: Task
  onPatch: (patch: Partial<Task>) => void
  onDelete: () => void
  onClose: () => void
}

export default function DetailPanel({ task, onPatch, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  // 메모가 없을 때도 처음엔 미리보기('메모 추가…')로 연다. 바로 입력칸을 띄우면
  // 폰에서 항목을 눌렀을 뿐인데 키보드가 올라와 화면 절반을 가린다.
  const [editingNotes, setEditingNotes] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // 다른 task 를 열면 로컬 편집 상태를 갈아끼운다
  useEffect(() => {
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setEditingNotes(false)
    // 키보드로 연 사람이 패널 안에서 시작하도록
    closeRef.current?.focus({ preventScroll: true })
  }, [task.id])

  // 다른 기기에서 고친 값은 받아오되, 지금 손대고 있는 칸은 덮어쓰지 않는다
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(task.title)
  }, [task.title])
  useEffect(() => {
    if (document.activeElement !== notesRef.current) setNotes(task.notes ?? '')
  }, [task.notes])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (editingNotes) notesRef.current?.focus()
  }, [editingNotes])

  function commitTitle() {
    const next = title.trim()
    if (next && next !== task.title) onPatch({ title: next })
    else if (!next) setTitle(task.title)
  }

  function commitNotes() {
    const next = notes.trim() || null
    if (next !== task.notes) onPatch({ notes: next })
    setEditingNotes(false)
  }

  function setDue(dateStr: string, timeStr: string) {
    const { due, allDay } = composeDue(dateStr, timeStr)
    onPatch({ due_at: due, is_all_day: allDay })
  }

  const dateStr = toDateInput(task.due_at)
  const timeStr = toTimeInput(task.due_at, task.is_all_day)

  return (
    <div className="detail" role="dialog" aria-label={`${task.title} 상세`}>
      <div className="detail-head">
        <button ref={closeRef} onClick={onClose} title="닫기 (Esc)" aria-label="닫기">
          <XIcon />
        </button>
        <span style={{ flex: 1 }} />
        <button className="danger" onClick={onDelete}>
          삭제
        </button>
      </div>

      <div className="detail-body">
        <textarea
          ref={titleRef}
          className="detail-title"
          aria-label="제목"
          value={title}
          rows={Math.min(4, Math.ceil(title.length / 24) || 1)}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />

        <div className="field">
          <label htmlFor="detail-due">마감</label>
          <input
            id="detail-due"
            type="date"
            value={dateStr}
            onChange={(e) => setDue(e.target.value, timeStr)}
          />
          <input
            type="time"
            aria-label="마감 시각"
            value={timeStr}
            disabled={!dateStr}
            onChange={(e) => setDue(dateStr, e.target.value)}
          />
          {dateStr && (
            <button
              className="field-clear"
              onClick={() => onPatch({ due_at: null, is_all_day: true })}
              title="마감일 지우기"
              aria-label="마감일 지우기"
            >
              <XIcon />
            </button>
          )}
        </div>

        <div className="field">
          <span className="field-label" id="detail-cat">분류</span>
          <div className="seg" role="radiogroup" aria-labelledby="detail-cat">
            {(['academic', 'other'] as Category[]).map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={task.category === c}
                className={task.category === c ? 'on' : ''}
                onClick={() => onPatch({ category: c })}
              >
                <span className="cat-swatch" style={{ background: CATEGORY_COLOR[c] }} />
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="detail-repeat">반복</label>
          <select
            id="detail-repeat"
            value={task.repeat}
            onChange={(e) => onPatch({ repeat: e.target.value as Repeat })}
            disabled={!task.due_at}
            title={task.due_at ? undefined : '마감일이 있어야 반복할 수 있습니다'}
          >
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
              <option key={r} value={r}>
                {REPEAT_LABEL[r]}
              </option>
            ))}
          </select>
        </div>

        {editingNotes ? (
          <textarea
            ref={notesRef}
            className="notes-area"
            aria-label="메모 (마크다운)"
            value={notes}
            placeholder="메모"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={commitNotes}
          />
        ) : (
          <div
            className="notes-preview"
            role="button"
            tabIndex={0}
            aria-label={notes ? '메모 편집' : '메모 추가'}
            onClick={() => setEditingNotes(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setEditingNotes(true)
              }
            }}
            title="눌러서 편집"
          >
            {notes ? (
              <Suspense fallback={<span className="notes-placeholder">…</span>}>
                <Markdown source={notes} />
              </Suspense>
            ) : (
              <span className="notes-placeholder">메모 추가…</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
