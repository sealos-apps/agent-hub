import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface AgentMarkdownPreviewProps {
  content: string
}

export function AgentMarkdownPreview({ content }: AgentMarkdownPreviewProps) {
  const normalized = String(content || '').trim()

  if (!normalized) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-[20px] border border-dashed border-zinc-300 bg-white text-sm text-zinc-400">
        文件内容为空
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto rounded-[20px] border border-zinc-200 bg-white p-5">
      <div className="agent-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}
