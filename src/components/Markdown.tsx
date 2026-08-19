import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 메모 렌더러를 따로 떼어 둔다.
 * 마크다운 파서는 초기 번들의 절반을 차지하는데 상세 패널을 열기 전까지는 쓰이지 않는다.
 */
export default function Markdown({ source }: { source: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
}
