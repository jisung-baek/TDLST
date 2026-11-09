/**
 * 선 아이콘 모음.
 *
 * ‹ › ✕ ↻ ≡ 같은 글리프는 서체마다 크기·굵기·기준선이 달라서, 버튼 한가운데 놓아도
 * 잉크가 한쪽으로 쏠리거나 4px 남짓으로 쪼그라든다. 모두 같은 10×10 격자 위에
 * 중심(5,5) 대칭으로 그리고, 크기와 색은 CSS(width/height, currentColor)가 정한다.
 */

type Props = { className?: string }

const base = {
  viewBox: '0 0 10 10',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** 기본은 아래를 향한다. 다른 방향은 dir 로 돌린다. */
export function Chevron({ className, dir = 'down' }: Props & { dir?: 'down' | 'up' | 'left' | 'right' }) {
  const d = {
    down: 'M2.5 3.75 5 6.25 7.5 3.75',
    up: 'M2.5 6.25 5 3.75 7.5 6.25',
    left: 'M6.25 2.5 3.75 5 6.25 7.5',
    right: 'M3.75 2.5 6.25 5 3.75 7.5',
  }[dir]
  return (
    <svg {...base} className={'icon ' + (className ?? '')}>
      <path d={d} />
    </svg>
  )
}

export function XIcon({ className }: Props) {
  return (
    <svg {...base} className={'icon ' + (className ?? '')}>
      <path d="M2.75 2.75 7.25 7.25M7.25 2.75 2.75 7.25" />
    </svg>
  )
}

export function RepeatIcon({ className }: Props) {
  return (
    <svg {...base} className={'icon ' + (className ?? '')}>
      <path d="M8 4.2A3.3 3.3 0 1 0 8.3 6" />
      <path d="M8.3 1.7v2.6H5.7" />
    </svg>
  )
}

export function NoteIcon({ className }: Props) {
  return (
    <svg {...base} className={'icon ' + (className ?? '')}>
      <path d="M2 3h6M2 5h6M2 7h3.5" />
    </svg>
  )
}
